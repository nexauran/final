// components/CartPage.tsx
"use client";

import Container from "@/components/Container";
import EmptyCart from "@/components/EmptyCart";
import NoAccessToCart from "@/components/NoAccessToCart";
import PriceFormater from "@/components/PriceFormater";
import AddToWishlistButton from "@/components/AddToWishlistButton";
import QuantityButton from "@/components/QuantityButton";
import Title from "@/components/Title";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";
import useStore from "@/store";
import { useAuth, useUser } from "@clerk/nextjs";
import { ShoppingBag, Trash } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import AddAddressModal from "@/components/AddAddressModal";

/** Minimal types — extend as needed */
type AddressDoc = {
  _id?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  default?: boolean;
  publishedAt?: string;
  createdAt?: string;
};



/**
 * Helpers: safe extractors for Clerk user fields
 */
function getUserEmail(user: unknown): string | undefined {
  try {
    const u = user as any;
    if (!u) return undefined;
    if (u.primaryEmailAddress?.emailAddress) return String(u.primaryEmailAddress.emailAddress);
    if (Array.isArray(u.emailAddresses) && u.emailAddresses[0]?.emailAddress) {
      return String(u.emailAddresses[0].emailAddress);
    }
    if (typeof u.email === "string") return u.email;
  } catch {
    // ignore
  }
  return undefined;
}

function getUserPhone(user: unknown): string | undefined {
  try {
    const u = user as any;
    if (!u) return undefined;
    if (Array.isArray(u.phoneNumbers) && (u.phoneNumbers[0]?.phoneNumber || u.phoneNumbers[0]?.phone)) {
      return String(u.phoneNumbers[0]?.phoneNumber ?? u.phoneNumbers[0]?.phone);
    }
    if (typeof u.phoneNumber === "string") return u.phoneNumber;
  } catch {
    // ignore
  }
  return undefined;
}

function makeClientUUID(): string {
  try {
    // @ts-ignore - available in modern browsers
    if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
      // @ts-ignore
      return (crypto as any).randomUUID();
    }
  } catch {
    // ignore
  }
  return "id-" + Math.random().toString(36).slice(2, 11);
}

const CartPage: React.FC = () => {
  const router = useRouter();

  const {
    deleteCartProduct,
    getTotalPrice,
    getItemCount,
    getSubTotalPrice,
    resetCart,
    getGroupedItems,
  } = useStore() as any;

  const [loading, setLoading] = useState(false);
    const groupedItems = useStore((state) => state.getGroupedItems());
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const [addresses, setAddresses] = useState<AddressDoc[] | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<AddressDoc | null>(null);

  // controlled radio value
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");

  // --- UPDATED: fetch only addresses for current logged-in user's email ---
  const fetchAddresses = async () => {
    try {
      const email = getUserEmail(user);

      if (!email) {
        setAddresses([]);
        setSelectedAddress(null);
        setSelectedAddressId("");
        return;
      }

      const query = `*[_type == "address" && email == $email] 
                     | order(default desc, createdAt desc)`;
      const params = { email };

      const data = (await client.fetch(query, params)) as AddressDoc[] | undefined;

      setAddresses(data ?? []);

      const defaultAddress = (data ?? []).find((addr) => addr?.default);

      if (defaultAddress) {
        setSelectedAddress(defaultAddress);
        setSelectedAddressId(defaultAddress._id ?? "");
      } else if ((data ?? []).length > 0) {
        setSelectedAddress(data![0]);
        setSelectedAddressId(data![0]._id ?? "");
      } else {
        setSelectedAddress(null);
        setSelectedAddressId("");
      }
    } catch (error: unknown) {
      console.log("Addresses fetching error:", error);
    }
  };
  // ------------------------------------------------------------------------

  useEffect(() => {
    fetchAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleResetCart = () => {
    const confirmed = window.confirm("Are you sure you want to reset your cart?");
    if (confirmed) {
      resetCart();
      toast.success("Cart reset successfully!");
    }
  };

  async function loadRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector("script[src='https://checkout.razorpay.com/v1/checkout.js']");
      if (existing) return resolve();

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
      document.body.appendChild(script);
    });
  }

  /**
   * Proceed to checkout — new flow using Razorpay Checkout and server-side verification.
   * Will NOT proceed if there's no selected address.
   */
  const handleProceedToCheckout = async () => {
    try {
      // guard: ensure an address is selected
      if (!selectedAddressId || !selectedAddress) {
        toast.error("Please add or select a delivery address before checkout.");
        return;
      }

      setLoading(true);

      // Ensure we have an idempotency key for this checkout attempt.
      let idempotencyKey = typeof window !== "undefined" ? sessionStorage.getItem("checkout_idempotency_key") : null;
      if (!idempotencyKey) {
        idempotencyKey = makeClientUUID();
        try {
          sessionStorage.setItem("checkout_idempotency_key", idempotencyKey);
        } catch (e) {
          // ignore storage failures
        }
      }

      const itemsPayload = (groupedItems ?? []).map(({ product }) => {
        const qty = (product?._id ? getItemCount(product._id) : 1) || 1;
        return {
          product: { _ref: product?._id ?? "" },
          quantity: qty,
        };
      });

      const totalAmount = getTotalPrice();
      if (!totalAmount || totalAmount <= 0) {
        toast.error("Cart is empty or invalid total.");
        setLoading(false);
        return;
      }

      const customerName =
        (user && (user.fullName ?? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim())) ||
        selectedAddress?.name ||
        "";

      const customerEmail = getUserEmail(user) ?? "";
      const customerPhone = getUserPhone(user) ?? "";

      if (!customerName || !customerEmail) {
        toast.error("Please make sure your name and email are available (login or add address).");
        setLoading(false);
        return;
      }

      // 1) Create order in your system (Sanity draft)
      const createBody = {
        customerName,
        email: customerEmail,
        clerkUserId: (user as any)?.id ?? (user as any)?.userId ?? "unknown",
        products: itemsPayload,
        address: selectedAddress ?? {},
        totalPrice: totalAmount,
        currency: "INR",
        amountDiscount: Number((getSubTotalPrice() - getTotalPrice()) || 0),
      };

      const createRes = await fetch("/api/orders/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(createBody),
      });

      const createJson: any = await createRes.json();
      console.log("create order response:", createJson);

      if (!createJson?.orderNumber) {
        console.error("Order creation failed:", createJson);
        toast.error("Failed to create order. Try again.");
        setLoading(false);
        return;
      }

      const orderNumber = createJson.orderNumber;

      // 2) Request a Razorpay Order from your server.
      const createRzpRes = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber,
          amount: Math.round(getTotalPrice()),
          currency: "INR",
        }),
      });

      const rzpJson: any = await createRzpRes.json();
      console.log("razorpay create-order response:", rzpJson);

      if (!rzpJson?.id || !rzpJson?.keyId) {
        if (createJson.razorpayOrder && createJson.razorpayOrder.id && createJson.razorpayOrder.keyId) {
          rzpJson.id = createJson.razorpayOrder.id;
          rzpJson.amount = createJson.razorpayOrder.amount ?? Math.round(getTotalPrice());
          rzpJson.currency = createJson.razorpayOrder.currency ?? "INR";
          rzpJson.keyId = createJson.razorpayOrder.keyId;
        } else {
          console.error("Failed to obtain Razorpay order id:", rzpJson);
          toast.error("Failed to initiate payment. Try again.");
          setLoading(false);
          return;
        }
      }

      // 3) Load Razorpay SDK
      try {
        await loadRazorpayScript();
      } catch (err) {
        console.error("Failed to load Razorpay script", err);
        toast.error("Payment SDK failed to load.");
        setLoading(false);
        return;
      }

      // 4) Open Razorpay Checkout
      const options: any = {
        key: rzpJson.keyId,
        amount: rzpJson.amount ?? Math.round(getTotalPrice()),
        currency: rzpJson.currency ?? "INR",
        name: "Your Shop",
        description: `Order ${orderNumber}`,
        order_id: rzpJson.id,
        prefill: {
          name: customerName,
          email: customerEmail,
          contact: customerPhone ?? "",
        },
        handler: async function (response: any) {
          try {
            setLoading(true);

            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                orderNumber,
              }),
            });

            const verifyJson: any = await verifyRes.json();
            console.log("verify response:", verifyJson);

            if (verifyRes.ok && verifyJson.ok) {
              try {
                sessionStorage.removeItem("checkout_idempotency_key");
              } catch {}
              resetCart();
              toast.success("Payment verified — order confirmed!");
              router.push(`/order/confirm?orderNumber=${encodeURIComponent(orderNumber)}`);
            } else {
              console.error("Payment verification failed:", verifyJson);
              toast.error(verifyJson?.message || "Payment verification failed.");
              router.push(`/order/confirm?orderNumber=${encodeURIComponent(orderNumber)}&status=failed`);
            }
          } catch (err: unknown) {
            console.error("verification error:", err);
            toast.error("Payment verification error.");
            router.push(`/order/confirm?orderNumber=${encodeURIComponent(orderNumber)}&status=error`);
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: function () {
            console.log("Razorpay modal closed by user.");
          },
        },
        theme: { color: "#F37254" },
      };

      // @ts-ignore
      const rzp = new (window as any).Razorpay(options);

      rzp.on && rzp.on("payment.failed", function (response: any) {
        console.error("payment.failed", response);
        toast.error("Payment failed or cancelled.");
        router.push(`/order/confirm?orderNumber=${encodeURIComponent(orderNumber)}&status=failed`);
      });

      rzp.open();

      setLoading(false);
      return;
    } catch (err: unknown) {
      console.error("checkout error:", err);
      toast.error((err as any)?.message || "Checkout failed");
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 pb-52 md:pb-10">
      {isSignedIn ? (
        <Container>
          {groupedItems && groupedItems.length ? (
            <>
              <div className="flex items-center gap-2 py-5">
                <ShoppingBag className="text-darkColor" />
                <Title>Shopping Cart</Title>
              </div>
              <div className="grid lg:grid-cols-3 md:gap-8">
                <div className="lg:col-span-2 rounded-lg">
                  <div className="border bg-white rounded-md">
                    {groupedItems.map(({ product }, idx) => {
                      const itemCount = getItemCount(product?._id ?? "") || 1;
                      const key = product?._id ?? product?.slug?.current ?? `product-${idx}`;
                      const imageSrc = product?.images && product.images.length ? urlFor(product.images[0]).url() : "/placeholder.png";

                      return (
                        <div
                          key={key}
                          className="border-b p-2.5 last:border-b-0 flex items-center justify-between gap-5"
                        >
                          <div className="flex flex-1 items-start gap-2 h-36 md:h-44">
                            {product && product.images && (
                              <Link
                                href={`/product/${product?.slug?.current ?? ""}`}
                                className="border p-0.5 md:p-1 mr-2 rounded-md overflow-hidden group"
                              >
                                <img
                                  src={imageSrc ?? "/placeholder.png"}
                                  alt="productImage"
                                  width={500}
                                  height={500}
                                  loading="lazy"
                                  className="w-32 md:w-40 h-32 md:h-40 object-cover group-hover:scale-105 hoverEffect"
                                />
                              </Link>
                            )}
                            <div className="h-full flex flex-1 flex-col justify-between py-1">
                              <div className="flex flex-col gap-0.5 md:gap-1.5">
                                <h2 className="text-base font-semibold line-clamp-1">
                                  {product?.name ?? ""}
                                </h2>
                                <p className="text-sm capitalize">
                                  Variant:{" "}
                                  <span className="font-semibold">
                                    {product?.variant ?? ""}
                                  </span>
                                </p>
                                <p className="text-sm capitalize">
                                  Status:{" "}
                                  <span className="font-semibold">
                                    {product?.status ?? ""}
                                  </span>
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                        <AddToWishlistButton
                                          product={product!}
                                          className="relative top-0 right-0"
                                        />
                                      </TooltipTrigger>
                                    <TooltipContent className="font-bold">
                                      Add to Favorite
                                    </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Trash
                                        onClick={() => {
                                          deleteCartProduct(product?._id ?? "");
                                          toast.success("Product deleted successfully!");
                                        }}
                                        className="w-4 h-4 md:w-5 md:h-5 mr-1 text-gray-500 hover:text-red-600 hoverEffect"
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent className="font-bold bg-red-600">
                                      Delete product
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-start justify-between h-36 md:h-44 p-0.5 md:p-1">
                            <PriceFormater
                              amount={(product?.price as number) * itemCount}
                              className="font-bold text-lg"
                            />
                            <QuantityButton product={product} />
                          </div>
                        </div>
                      );
                    })}
                    <Button onClick={handleResetCart} className="m-5 font-semibold" variant="destructive">
                      Reset Cart
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="lg:col-span-1">
                    <div className="hidden md:inline-block w-full bg-white p-6 rounded-lg border">
                      <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span>SubTotal</span>
                          <PriceFormater amount={getSubTotalPrice()} />
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Discount</span>
                          <PriceFormater amount={getSubTotalPrice() - getTotalPrice()} />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between font-semibold text-lg">
                          <span>Total</span>
                          <PriceFormater amount={getTotalPrice()} className="text-lg font-bold text-black" />
                        </div>
                        <Button
                          className="w-full rounded-full font-semibold tracking-wide hoverEffect"
                          size="lg"
                          disabled={loading || !selectedAddressId}
                          onClick={handleProceedToCheckout}
                        >
                          {loading ? "Please wait..." : "Proceed to Checkout"}
                        </Button>
                      </div>
                    </div>

                    {addresses && (
                      <div className="bg-white rounded-md mt-5">
                        <Card>
                          <CardHeader>
                            <CardTitle>Delivery Address</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <RadioGroup
                              value={selectedAddressId}
                              onValueChange={(val) => {
                                setSelectedAddressId(val);
                                const found = (addresses ?? []).find((a) => a._id === val);
                                setSelectedAddress(found ?? null);
                              }}
                            >
                              {addresses.map((address) => (
                                <div
                                  key={address?._id ?? ""}
                                  className={`flex items-center space-x-2 mb-4 cursor-pointer ${selectedAddress && selectedAddress._id === address?._id ? "text-shop_dark_green" : ""}`}
                                >
                                  <RadioGroupItem value={address?._id ?? ""} />
                                  <Label htmlFor={`address-${address?._id ?? ""}`} className="grid gap-1.5 flex-1">
                                    <span className="font-semibold">{address?.name ?? ""}</span>
                                    <span className="text-sm text-black/60">
                                      {`${address?.address ?? ""}, ${address?.city ?? ""} ${address?.state ?? ""} ${address?.zip ?? ""}`}
                                    </span>
                                  </Label>
                                </div>
                              ))}
                            </RadioGroup>

                            <AddAddressModal
                              email={getUserEmail(user) ?? ""}
                              onSaved={() => {
                                // refresh address list after saving
                                fetchAddresses();
                                toast.success("Address saved");
                              }}
                            >
                              <Button variant="outline" className="w-full mt-4">
                                Add New Address
                              </Button>
                            </AddAddressModal>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </div>
                </div>

                <div className="md:hidden fixed bottom-0 left-0 w-full bg-white pt-2">
                  <div className="bg-white p-4 rounded-lg border mx-4">
                    <h2>Order Summary</h2>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span>SubTotal</span>
                        <PriceFormater amount={getSubTotalPrice()} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Discount</span>
                        <PriceFormater amount={getSubTotalPrice() - getTotalPrice()} />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between font-semibold text-lg">
                        <span>Total</span>
                        <PriceFormater amount={getTotalPrice()} className="text-lg font-bold text-black" />
                      </div>
                      <Button
                        className="w-full rounded-full font-semibold tracking-wide hoverEffect"
                        size="lg"
                        disabled={loading || !selectedAddressId}
                        onClick={handleProceedToCheckout}
                      >
                        {loading ? "Please wait..." : "Proceed to Checkout"}
                      </Button>
                    </div>
                  </div>
                </div>

              </div>
            </>
          ) : (
            <EmptyCart />
          )}
        </Container>
      ) : (
        <NoAccessToCart />
      )}
    </div>
  );
};

export default CartPage;

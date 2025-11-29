import React from "react";
import Link from "next/link";
import { client } from "@/sanity/lib/client";
import PriceFormater from "@/components/PriceFormater";
import { ShoppingBag } from "lucide-react";
import { urlFor } from "@/sanity/lib/image";

export const dynamic = "force-dynamic"; // always fetch fresh order data

type SearchParams = {
  orderNumber?: string;
  status?: string;
};

function formatDate(iso?: string) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default async function OrderConfirmPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Next.js App Router: searchParams is a Promise — await it
  const params = await searchParams;
  const orderNumber = String(params?.orderNumber || "").trim();
  const statusQuery = String(params?.status || "").trim();

  if (!orderNumber) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white p-6 rounded-lg shadow">
          <h1 className="text-2xl font-semibold mb-4">Order not specified</h1>
          <p className="mb-4">
            No order number was provided in the URL. If you just completed a payment, try opening the link from your email or
            check your orders page.
          </p>
          <Link href="/" className="inline-block rounded px-4 py-2 bg-slate-800 text-white">
            Continue shopping
          </Link>
        </div>
      </main>
    );
  }

  // GROQ: fetch order by orderNumber and expand referenced product details
  const query = `*[_type == "order" && orderNumber == $orderNumber][0]{
    _id,
    orderNumber,
    customerName,
    email,
    status,
    totalPrice,
    currency,
    amountDiscount,
    subtotal,
    shippingCharge,
    address,
    orderDate,
    paymentDate,
    razorpayPaymentId,
    razorpayPaymentLinkId,
    razorpayCustomerId,
    products[] {
      quantity,
      product-> {
        _id,
        name,
        slug,
        price,
        images
      }
    }
  }`;

  const order = await client.fetch(query, { orderNumber });

  if (!order) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white p-6 rounded-lg shadow">
          <h1 className="text-2xl font-semibold mb-4">Order not found</h1>
          <p className="mb-4">
            We couldn't find an order with number <strong>{orderNumber}</strong>.
          </p>
          <p className="mb-4">If you just completed a payment, please check your email for confirmation or contact support.</p>
          <Link href="/" className="inline-block rounded px-4 py-2 bg-slate-800 text-white">
            Continue shopping
          </Link>
        </div>
      </main>
    );
  }

  // destructure safely
  const {
    customerName,
    email,
    status,
    totalPrice,
    currency,
    amountDiscount,
    subtotal,
    shippingCharge,
    address,
    orderDate,
    paymentDate,
    razorpayPaymentId,
    razorpayPaymentLinkId,
    products,
  } = order as any;

  const items = Array.isArray(products) ? (products as any[]) : [];

  // Compute fallback subtotal if not present (sum product price * qty)
  const computedSubtotal =
    typeof subtotal === "number"
      ? subtotal
      : items.reduce((acc, it) => {
          const prod = it.product ?? {};
          const price = typeof prod.price === "number" ? prod.price : Number(prod.price ?? 0);
          const qty = Number(it.quantity ?? 1);
          return acc + price * qty;
        }, 0);

  // Discounts
  const displayDiscount = typeof amountDiscount === "number" ? amountDiscount : 0;

  // --- Shipping logic (same as cart): ₹59, free for orders >= ₹699 after discount ---
  const SHIPPING_FEE = 59;
  const FREE_SHIPPING_THRESHOLD = 699;

  // productsTotal is subtotal after discount (what we apply free-shipping threshold against)
  const productsTotal = Math.max(0, computedSubtotal - displayDiscount);

  // If the order record already has shippingCharge, prefer that. Otherwise compute using the same rule.
  const displayShipping = typeof shippingCharge === "number" ? shippingCharge : productsTotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;

  // Total: prefer stored totalPrice, otherwise compute from parts
  const displayTotal = typeof totalPrice === "number" ? totalPrice : Math.round(productsTotal + displayShipping);

  // Helper for WhatsApp / labels
  const shippingLabelForWA = displayShipping === 0 ? "FREE" : String(displayShipping);

  // --- Build WhatsApp URL server-side (only shown for paid orders) ---
  // Change to your phone number (no +, no spaces)
  const WHATSAPP_PHONE = "917306328115";

  // Build a short items summary: "Product xQty (price)"
  const itemsSummary = items.length
    ? items
        .map((it) => {
          const prod = it.product ?? {};
          const name = prod.name ?? "Item";
          const qty = it.quantity ?? 1;
          const price = typeof prod.price === "number" ? (prod.price * (it.quantity ?? 1)).toString() : String(prod.price ?? "N/A");
          return `${name} x${qty} (${price})`;
        })
        .join(", ")
    : "No items";

  const totalStr = String(displayTotal ?? "N/A");

  const waMessage = `Hello, I need help with my order.%0AOrder ID: ${orderNumber}%0ASubtotal: ${computedSubtotal}%0AAfter discount: ${productsTotal}%0AShipping: ${shippingLabelForWA}%0ADiscount: ${displayDiscount}%0ATotal: ${totalStr} ${currency ?? ""}%0AItems: ${itemsSummary}%0ACustomer: ${customerName ?? email ?? ""}`;

  // Note: we already percent-encoded newlines using %0A; keep it simple and safe for server rendering
  const waUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${waMessage}`;

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-4 mb-4">
            <ShoppingBag className="w-8 h-8 text-green-600" />
            <div>
              <h1 className="text-2xl font-semibold">
                Thank you — your order is {String(status || statusQuery || "pending").toUpperCase()}
              </h1>
              <p className="text-sm text-gray-600">
                Order number: <strong>{orderNumber}</strong>
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <section className="md:col-span-2">
              <h2 className="font-semibold mb-3">Items</h2>
              <div className="space-y-3">
                {items.length ? (
                  items.map((it, idx) => {
                    const prod = it.product ?? {};
                    const qty = it.quantity ?? 1;
                    const img = Array.isArray(prod.images) && prod.images.length ? prod.images[0] : null;

                    // safe image url building; urlFor may expect an object — guard it
                    let imgUrl = "/placeholder.png";
                    try {
                      if (img && typeof img === "object") {
                        imgUrl = urlFor(img).url();
                      } else if (typeof img === "string") {
                        imgUrl = img;
                      }
                    } catch {
                      imgUrl = "/placeholder.png";
                    }

                    return (
                      <div key={prod._id ?? idx} className="flex items-center gap-4 p-3 border rounded">
                        <div className="w-20 h-20 bg-gray-100 rounded overflow-hidden shrink-0">
                          {imgUrl ? (
                            <img src={imgUrl} alt={prod.name ?? ""} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">No image</div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium">{prod.name ?? "Unknown product"}</h3>
                            <div className="text-sm font-semibold">
                              <PriceFormater amount={Number((prod.price ?? 0) * qty)} />
                            </div>
                          </div>
                          <p className="text-sm text-gray-600">Qty: {qty}</p>
                          {prod.slug?.current && (
                            <Link href={`/product/${prod.slug.current}`} className="text-sm text-sky-600">
                              View product
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3 text-sm text-gray-600">No items recorded for this order.</div>
                )}
              </div>
            </section>

            <aside className="bg-gray-50 p-4 rounded">
              <h3 className="font-semibold mb-2">Order summary</h3>

              <div className="text-sm text-gray-700 mb-2">Subtotal</div>
              <div className="flex items-center justify-between mb-1">
                <span>Items total</span>
                <PriceFormater amount={computedSubtotal ?? 0} />
              </div>

              <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                <span>Discount</span>
                <PriceFormater amount={displayDiscount ?? 0} />
              </div>

              <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                <span>Shipping</span>
                {displayShipping === 0 ? (
                  <span className="font-semibold">FREE</span>
                ) : (
                  <PriceFormater amount={displayShipping ?? 0} />
                )}
              </div>

              <div className="border-t pt-3 mt-3 font-semibold text-lg flex items-center justify-between">
                <span>Total</span>
                <PriceFormater amount={displayTotal ?? 0} className="text-lg" />
              </div>

              <div className="mt-4 text-sm">
                <div className="mb-1">
                  <strong>Payment status:</strong> {String(status || statusQuery || "pending")}
                </div>
                {razorpayPaymentId && (
                  <div className="mb-1">
                    <strong>Payment ID:</strong> {razorpayPaymentId}
                  </div>
                )}
                {razorpayPaymentLinkId && (
                  <div className="mb-1">
                    <strong>Payment Link ID:</strong> {razorpayPaymentLinkId}
                  </div>
                )}
                {paymentDate && (
                  <div className="mb-1">
                    <strong>Paid at:</strong> {formatDate(paymentDate)}
                  </div>
                )}
              </div>
            </aside>
          </div>

          <div className="mt-6 border-t pt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold">Shipping address</h4>
                {address ? (
                  <div className="text-sm text-gray-700">
                    <div>{address.name}</div>
                    <div>{address.address}</div>
                    <div>
                      {address.city}, {address.state} {address.zip}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">No shipping address recorded.</div>
                )}
              </div>

              <div>
                <h4 className="font-semibold">Customer</h4>
                <div className="text-sm text-gray-700">
                  <div>{customerName}</div>
                  <div>{email}</div>
                  <div className="text-xs text-gray-500 mt-2">Order placed: {formatDate(orderDate)}</div>
                  <div>Usually dispatched within 1-2 days</div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Link href="/" className="inline-block rounded px-4 py-2 bg-slate-800 text-white">
                Continue shopping
              </Link>
              <Link href="/orders" className="inline-block rounded px-4 py-2 border">
                View all orders
              </Link>

              {/* Show WhatsApp contact button only if order is paid */}
              {String(status || statusQuery || "").toLowerCase() === "paid" && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded px-4 py-2 bg-green-600 text-white"
                >
                  Contact on WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

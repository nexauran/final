"use client";

import { MY_ORDERS_QUERYResult } from "@/sanity.types";
import React, { useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { urlFor } from "@/sanity/lib/image";
import PriceFormater from "./PriceFormater";

interface OrderDetailsDialogProps {
  order: MY_ORDERS_QUERYResult[number] | null;
  isOpen: boolean;
  onClose: () => void;
}

const WHATSAPP_PHONE = "917306328115"; // Your WhatsApp Number (No +, No Spaces)

/**
 * Local shape for the product item we expect from Sanity.
 * Adjust fields if your sanity schema has different shapes.
 */
type Slug = { current?: string } | undefined;

interface ProductImage {
  // Minimal shape to pass into urlFor. If your images have other properties add them here.
  _type?: string;
  asset?: any;
}

interface ProductItem {
  images?: ProductImage[] | null;
  name?: string | null;
  slug?: Slug | null;
  price?: number | string | null;
}

const OrderDetailDialog: React.FC<OrderDetailsDialogProps> = ({
  order,
  isOpen,
  onClose,
}) => {
  if (!order) return null;

  // --- Compute subtotal (fallback) ---
  const items = order.products ?? [];
  const computedSubtotal = typeof (order as any).subtotal === "number"
    ? (order as any).subtotal
    : (items as any[]).reduce((acc, it) => {
        const prod = (it?.product ?? {}) as ProductItem;
        const price = typeof prod.price === "number" ? prod.price : Number(prod.price ?? 0);
        const qty = Number(it?.quantity ?? 1);
        return acc + price * qty;
      }, 0);

  const displayDiscount = typeof order.amountDiscount === "number" ? order.amountDiscount : 0;

  // --- Shipping logic: same as cart ---
  const SHIPPING_FEE = 59;
  const FREE_SHIPPING_THRESHOLD = 699;

  const productsTotal = Math.max(0, computedSubtotal - displayDiscount);

  const displayShipping = typeof (order as any).shippingCharge === "number"
    ?  (order as any).shippingCharge
    : productsTotal >= FREE_SHIPPING_THRESHOLD
      ? 0
      : SHIPPING_FEE;

  const displayTotal = typeof order.totalPrice === "number"
    ? order.totalPrice
    : Math.round(productsTotal + displayShipping);

  // 🔥 Build WhatsApp message dynamically
  const buildWhatsAppMessage = useCallback(() => {
    const orderId = order.orderNumber ?? order._id ?? "Unknown";

    const total = typeof displayTotal === "number" ? displayTotal.toString() : String(displayTotal ?? "N/A");

    const itemsStr =
      (order.products
        ?.map((p) => {
          const name = (p?.product as ProductItem)?.name ?? "Item";
          const qty = p?.quantity ?? 1;
          const priceValue =
            typeof (p?.product as ProductItem)?.price === "number"
              ? ((p?.product as ProductItem)?.price as number).toFixed(2)
              : String((p?.product as ProductItem)?.price ?? "N/A");
          return `${name} x${qty} (${priceValue})`;
        })
        .join(", ")) || "No items";

    const shippingLabel = displayShipping === 0 ? "FREE" : String(displayShipping);

    const message = `Hello, I need help with my order.
Order ID: ${orderId}
Subtotal: ${computedSubtotal}
After discount: ${productsTotal}
Shipping: ${shippingLabel}
Discount: ${displayDiscount}
Total: ${total}
Items: ${itemsStr}
Customer: ${order.customerName ?? order.email ?? ""}`;

    return encodeURIComponent(message);
  }, [order, computedSubtotal, productsTotal, displayShipping, displayDiscount, displayTotal]);

  // 🔥 WhatsApp button action
  const handleWhatsAppClick = useCallback(() => {
    const url = `https://wa.me/${WHATSAPP_PHONE}?text=${buildWhatsAppMessage()}`;
    window.open(url, "_blank", "noopener");
  }, [buildWhatsAppMessage]);

  const isPaid = String(order.status ?? "").toLowerCase() === "paid";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="!max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 w-full pb-3 border-b">
            <div>
              <DialogTitle className="text-lg leading-tight">
                <span className="font-medium mr-3">Order</span>
                <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded-lg">
                  {order.orderNumber ?? order._id}
                </span>
              </DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                {order.customerName ?? order.email}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`text-sm font-semibold px-3 py-1 rounded-full  ${
                  isPaid ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {String(order.status ?? "UNKNOWN").toUpperCase()}
              </div>

              {order?.invoice?.hosted_invoice_url && (
                <Link href={order.invoice.hosted_invoice_url} target="_blank">
                  <Button className="px-3 py-1">Invoice</Button>
                </Link>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            {/* ITEMS CARD (rounded) */}
            <section className="md:col-span-2 bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold">Items</h3>

                {isPaid && (
                  <button
                    onClick={handleWhatsAppClick}
                    className="px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                  >
                    Contact on WhatsApp
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {order.products?.length ? (
                  order.products.map((product, idx) => {
                    const prod = (product?.product ?? {}) as ProductItem;
                    const qty = product?.quantity ?? 1;

                    const img = Array.isArray(prod.images) && prod.images.length ? prod.images[0] : null;
                    let imgUrl = "";
                    try {
                      if (img) imgUrl = urlFor(img).url();
                    } catch {
                      imgUrl = "";
                    }

                    const displayName = prod.name ?? "Unnamed product";
                    const slugCurrent = prod.slug?.current;
                    const unitPrice = typeof prod.price === "number" ? prod.price : Number(prod.price ?? 0);

                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-4 p-3 rounded-lg border bg-gray-50"
                      >
                        <div className="w-20 h-20 rounded-md overflow-hidden bg-white flex items-center justify-center shrink-0">
                          {imgUrl ? (
                            <img src={imgUrl} alt={displayName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-xs text-gray-400">No image</div>
                          )}
                        </div>

                        <div className="flex-1 flex items-center justify-between gap-4">
                          <div>
                            <div className="font-medium text-sm">{displayName}</div>
                            {slugCurrent && (
                              <Link href={`/product/${slugCurrent}`} className="text-sm text-sky-600">
                                View product
                              </Link>
                            )}
                          </div>

                          <div className="text-right">
                            <div className="text-sm text-gray-600">Qty: {qty}</div>
                            <div className="text-sm font-semibold">
                              <PriceFormater amount={Number(unitPrice * qty)} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3 text-sm text-gray-600 rounded-md bg-white border">
                    No items recorded for this order.
                  </div>
                )}
              </div>
            </section>

            {/* SUMMARY CARD (rounded) */}
            <aside className="bg-white border rounded-xl p-4 shadow-sm">
              <h4 className="font-semibold mb-3">Order summary</h4>

              <div className="text-sm text-gray-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span>Items total</span>
                  <PriceFormater amount={computedSubtotal ?? 0} />
                </div>

                <div className="flex items-center justify-between">
                  <span>Discount</span>
                  <PriceFormater amount={displayDiscount ?? 0} />
                </div>

                <div className="flex items-center justify-between">
                  <span>Shipping</span>
                  {displayShipping === 0 ? (
                    <span className="font-semibold text-green-600">FREE</span>
                  ) : (
                    <PriceFormater amount={displayShipping ?? 0} />
                  )}
                </div>

                <div className="border-t pt-3 mt-3 flex items-center justify-between font-semibold text-lg">
                  <span>Total</span>
                  <PriceFormater amount={displayTotal ?? 0} />
                </div>

                {order.orderDate && (
                  <div className="text-xs text-gray-500">Ordered: {new Date(order.orderDate).toLocaleString()}</div>
                )}
              </div>
            </aside>
          </div>

          {/* SHIPPING + CUSTOMER CARDS (rounded) */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white border rounded-xl p-4 shadow-sm">
              <h5 className="font-medium mb-2">Shipping address</h5>
              {order.address ? (
                <div className="text-sm text-gray-700 space-y-1">
                  <div>{order.address.name}</div>
                  <div>{order.address.address}</div>
                  <div>
                    {order.address.city}, {order.address.state} {order.address.zip}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-600">No shipping address recorded.</div>
              )}
            </div>

            <div className="bg-white border rounded-xl p-4 shadow-sm">
              <h5 className="font-medium mb-2">Customer</h5>
              <div className="text-sm text-gray-700 space-y-2">
                <div className="font-medium">{order.customerName}</div>
                <div className="text-sm text-gray-600">{order.email}</div>

                <div className="mt-3 flex gap-2">
                  <Link href="/" className="px-3 py-1 bg-slate-800 text-white rounded-md text-sm">
                    Continue shopping
                  </Link>
                  <Link href="/orders" className="px-3 py-1 border rounded-md text-sm">
                    View all orders
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetailDialog;

import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// -------------------------------
// 1. CREATE PAYMENT LINK
// -------------------------------
export async function createPaymentLink(amount: number, customer: any) {
  const res = await razorpay.paymentLink.create({
    amount: amount * 100,
    currency: "INR",
    customer: {
      name: customer.name,
      email: customer.email,
      contact: customer.phone,
    },
    notify: {
      sms: true,
      email: true,
    },
    callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}/order-confirm`,
    callback_method: "get",
  });

  return res;
}

// -------------------------------
// 2. FETCH ONE PAYMENT LINK
// -------------------------------
export async function fetchPaymentLink(paymentLinkId: string) {
  const res = await razorpay.paymentLink.fetch(paymentLinkId);
  return res;
}

// -------------------------------
// 3. LIST PAYMENT LINKS
// -------------------------------
export async function listPaymentLinks(limit = 10, skip = 0) {
  const res = await razorpay.paymentLink.all({
    count: limit,
    skip,
  });

  return res;
}

// -------------------------------
// 4. VERIFY SIGNATURE
// -------------------------------
import crypto from "crypto";

export function verifyRazorpaySignature({
  order_id,
  payment_id,
  signature,
}: {
  order_id: string;
  payment_id: string;
  signature: string;
}) {
  const body = order_id + "|" + payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest("hex");

  return expectedSignature === signature;
}

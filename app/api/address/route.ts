import { NextResponse } from "next/server";
import { sanity } from "@/lib/sanity";

interface AddressDoc {
  _id: string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      name,
      email,
      address,
      city,
      state,
      zip,
      default: isDefault,
    } = body;

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // create address document (annotate created to ensure we have _id)
    const created: { _id: string } = await sanity.create({
      _type: "address",
      name,
      email,
      address,
      city,
      state,
      zip,
      default: !!isDefault,
      createdAt: new Date().toISOString(),
    });

    // if default = true, unset others
    if (isDefault) {
      // 1. Find all other default addresses for the same email
      const others = await sanity.fetch<AddressDoc[]>(
        `*[_type == "address" && email == $email && _id != $id && default == true]{ _id }`,
        { email, id: created._id }
      );

      // 2. Remove default from all of them
      await Promise.all(
        others.map((addr: AddressDoc) =>
          sanity
            .patch(addr._id)
            .set({ default: false })
            .commit({ autoGenerateArrayKeys: true })
        )
      );
    }

    return NextResponse.json({ success: true, address: created });
  } catch (err) {
    console.error("Address create error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

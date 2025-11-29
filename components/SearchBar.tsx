"use client";

import React, { useEffect, useState, useRef } from "react";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { client } from "@/sanity/lib/client";

type ProductHit = {
  _id: string;
  title?: string;
  // server-side GROQ below maps "slug": slug.current so slug will be a string,
  // but handle both shapes just in case.
  slug?: string | { current?: string } | null;
  price?: number;
  images?: { asset?: { url?: string } }[];
};

export default function SearchBar({ placeholder = "Search products..." }: { placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false); // mobile modal + desktop dropdown
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);

  const GROQ = `*[_type == "product" && (title match $term || description match $term)]{
    _id,
    title,
    "slug": slug.current,
    price,
    images[]{asset->{url}}
  }[0...20]`;

  // Close when clicking outside — only for desktop. On mobile we use the full-screen overlay and
  // don't want accidental document clicks to close it.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      // only react to clicks when viewport is >= md (768px)
      if (window.innerWidth < 768) return;
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // Focus mobile input when overlay opens on small screens
  useEffect(() => {
    if (!open) return;
    if (window.innerWidth < 768) {
      // small delay helps on some mobile browsers
      setTimeout(() => mobileInputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced Query
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await client.fetch(GROQ, { term: `${query}*` });
        setResults(res || []);
      } catch (err) {
        console.error("Search error:", err);
        setResults([]);
      } finally {
        setLoading(false);
        setOpen(true);
      }
    }, 300);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  const normalizeSlug = (s: ProductHit["slug"]) => {
    if (!s) return "";
    return typeof s === "string" ? s : s.current ?? "";
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">


      {/* ------------------------------------------------------ */}
      {/* DESKTOP SEARCH BAR */}
      {/* ------------------------------------------------------ */}
      <form
        onSubmit={(e) => e.preventDefault()}
        className="relative hidden md:block"
      >
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 cursor-pointer"
          onClick={() => setOpen(true)}
        />

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-full border border-gray-300 px-4 py-2 pl-10 focus:outline-none focus:ring-2 focus:ring-shop_light_green"
        />
      </form>

      {/* ------------------------------------------------------ */}
      {/* DESKTOP DROPDOWN RESULTS */}
      {/* ------------------------------------------------------ */}
      {open && (
        <div className="hidden md:block absolute z-50 mt-2 w-full rounded-lg bg-white shadow-lg">
          <div className="max-h-72 overflow-auto">
            {loading ? (
              <div className="p-4 text-sm">Loading…</div>
            ) : results.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No results</div>
            ) : (
              results.map((hit) => {
                const img = hit.images?.[0]?.asset?.url;
                const slug = normalizeSlug(hit.slug);

                return (
                  <Link
                    key={hit._id}
                    href={`/product/${slug}`}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                      setResults([]);
                    }}
                  >
                    {img ? (
                      <img src={img} alt={hit.title} className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-500">img</div>
                    )}

                    <div className="flex-1 overflow-hidden">
                      <div className="truncate text-sm font-medium">{hit.title}</div>
                      {hit.price !== undefined && (
                        <div className="text-xs text-gray-500">₹{hit.price.toFixed(2)}</div>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}

     
    </div>
  );
}

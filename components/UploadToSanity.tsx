"use client";

import React, { useState } from "react";

type Props = {
  name?: string;   // pass current user's name if available
  email?: string;  // pass current user's email if available
};

export default function UploadToSanity({ name = "", email = "" }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected) return;
    setFiles(Array.from(selected));
    setMessage(null);
  }

  async function handleUpload() {
    if (files.length === 0) {
      setMessage("Please select at least one file.");
      return;
    }
    if (!email || !name) {
      setMessage("Name and email are required (pass them as props or collect from signed-in user).");
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f)); // 'files' key
      form.append("name", name);
      form.append("email", email);

      const res = await fetch("/api/upload-images", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Upload failed");
      }

      const data = await res.json();
      setMessage(`Uploaded ${data.created?.length ?? 0} file(s).`);
      setFiles([]);
    } catch (err: any) {
      console.error(err);
      setMessage("Upload failed: " + (err.message ?? err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <label style={{ display: "block", marginBottom: 8 }}>
        Choose images
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onFilesSelected}
          style={{ display: "block", marginTop: 6 }}
        />
      </label>

      {files.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {files.map((f) => (
            <div key={f.name} style={{ width: 120, textAlign: "center" }}>
              <img
                src={URL.createObjectURL(f)}
                alt={f.name}
                style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 6 }}
              />
              <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleUpload}
          disabled={uploading || files.length === 0}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: uploading ? "#9aa" : "#3b82f6",
            color: "white",
            cursor: uploading ? "default" : "pointer",
          }}
        >
          {uploading ? "Uploading..." : `Upload ${files.length} Image(s)`}
        </button>

        <button
          onClick={() => {
            setFiles([]);
            setMessage(null);
          }}
          disabled={uploading}
          style={{ padding: "10px 12px", borderRadius: 8 }}
        >
          Clear
        </button>
      </div>

      {message && <p style={{ marginTop: 12 }}>{message}</p>}
    </div>
  );
}

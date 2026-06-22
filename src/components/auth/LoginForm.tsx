"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { getLoginErrorMessage } from "@/lib/auth-error-message";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(getLoginErrorMessage());
        return;
      }

      router.push("/?app=library");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-[150px] w-full max-w-sm">
      <AnimatePresence mode="wait">
        <motion.div
          key="login-step"
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 100 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="space-y-6 text-center"
        >
          <div className="space-y-1">
            <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-normal text-white">
              {"\u6b22\u8fce\u56de\u6765"}
            </h1>
            <p className="text-[1.8rem] font-light text-white/70">
              {"\u8bf7\u4f7f\u7528\u90ae\u7bb1\u767b\u5f55"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              placeholder={"\u8bf7\u8f93\u5165\u90ae\u7bb1\u5730\u5740"}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-full border border-white/10 bg-transparent px-4 py-3 text-center text-white backdrop-blur-[1px] placeholder:text-white/35 focus:border-white/30 focus:outline-none"
              required
            />
            <input
              type="password"
              placeholder={"\u8bf7\u8f93\u5165\u5bc6\u7801"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-full border border-white/10 bg-transparent px-4 py-3 text-center text-white backdrop-blur-[1px] placeholder:text-white/35 focus:border-white/30 focus:outline-none"
              required
            />

            <motion.button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-white py-3 font-medium text-black transition-colors hover:bg-white/90"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              {submitting ? "\u767b\u5f55\u4e2d" : "\u767b\u5f55"}
            </motion.button>

            <motion.button
              type="button"
              className="w-full rounded-full bg-white py-3 font-medium text-black transition-colors hover:bg-white/90"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
              onClick={() => router.push("/register")}
            >
              {"\u6ce8\u518c"}
            </motion.button>
          </form>

          {error ? (
            <p className="text-sm text-red-300/90">{error}</p>
          ) : null}

          <p className="pt-6 text-xs text-white/40">
            {"\u767b\u5f55\u5373\u8868\u793a\u4f60\u540c\u610f"}
            <Link
              href="#"
              className="underline transition-colors hover:text-white/60"
            >
              {"\u300a\u4e3b\u670d\u52a1\u534f\u8bae\u300b"}
            </Link>
            {"\u548c"}
            <Link
              href="#"
              className="underline transition-colors hover:text-white/60"
            >
              {"\u300a\u9690\u79c1\u58f0\u660e\u300b"}
            </Link>
            {"\u3002"}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

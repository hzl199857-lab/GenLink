"use client";

import { ArrowRight, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import {
  getRegisterAccountErrorMessage,
  getRegisterFlowErrorMessage,
  getLoginErrorMessage,
} from "@/lib/auth-error-message";
import { getCompleteRegisterCode } from "@/lib/register-code";

const emptyCode = () => ["", "", "", "", "", ""];
const registerInputBaseClass =
  "w-full rounded-full border px-4 py-3 text-center text-white backdrop-blur-[1px] transition-colors focus:border-white/30 focus:outline-none";
const registerInputDefaultClass = "border-white/10 bg-transparent";
const registerInputValidClass = "border-sky-300/35 bg-sky-300/10";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

interface RegisterFlowProps {
  onSuccess?: () => void;
}

export function RegisterFlow({ onSuccess }: RegisterFlowProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [step, setStep] = useState<"email" | "code" | "success">("email");
  const [code, setCode] = useState(emptyCode);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (step !== "success") {
      return;
    }

    completionTimerRef.current = setTimeout(() => {
      onSuccess?.();
    }, 700);

    return () => {
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [onSuccess, step]);

  useEffect(() => {
    if (step === "code") {
      const focusTimer = setTimeout(() => {
        codeInputRefs.current[0]?.focus();
      }, 500);

      return () => clearTimeout(focusTimer);
    }
  }, [step]);

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailTouched(true);
    setPasswordTouched(true);

    if (!isValidEmail(email) || !password.trim()) {
      return;
    }

    setSendingCode(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/send-register-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        devCode?: string;
      };

      if (!response.ok || !result.ok) {
        setError(getRegisterFlowErrorMessage(result.error));
        return;
      }

      if (result.devCode && /^\d{6}$/.test(result.devCode)) {
        setCode(result.devCode.split(""));
      }

      setStep("code");
    } finally {
      setSendingCode(false);
    }
  };

  const handleCreateAccount = async (completedCode?: string) => {
    if (submitting) {
      return;
    }

    const codeValue = completedCode ?? getCompleteRegisterCode(code);
    if (!codeValue) {
      setError("\u9a8c\u8bc1\u7801\u9519\u8bef");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const verifyResponse = await fetch("/api/auth/verify-register-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: codeValue }),
      });
      const verifyResult = (await verifyResponse.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!verifyResponse.ok || !verifyResult.ok) {
        setError(getRegisterFlowErrorMessage(verifyResult.error));
        return;
      }

      const result = await authClient.signUp.email({
        email,
        password,
        name: email.split("@")[0] || email,
      });

      if (result.error) {
        setError(getRegisterAccountErrorMessage(result.error.message));
        return;
      }

      const signInResult = await authClient.signIn.email({
        email,
        password,
      });

      if (signInResult.error) {
        setError(getLoginErrorMessage());
        return;
      }

      setStep("success");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) {
      return;
    }

    const newCode = [...code];
    newCode[index] = value.replace(/\D/g, "");
    setCode(newCode);

    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }

    const completeCode = getCompleteRegisterCode(newCode);
    if (index === 5 && completeCode) {
      successTimerRef.current = setTimeout(() => {
        void handleCreateAccount(completeCode);
      }, 250);
    }
  };

  const handleKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleBackClick = () => {
    setStep("email");
    setCode(emptyCode());
  };

  return (
    <div className="w-full max-w-sm">
      <AnimatePresence mode="wait">
        {step === "email" ? (
          <motion.div
            key="email-step"
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="space-y-6 text-center"
          >
            <div className="space-y-1">
              <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-normal text-white">
                {"\u6b22\u8fce\u56de\u6765"}
              </h1>
              <p className="text-[1.8rem] font-light text-white/70">
                {"\u8bf7\u4f7f\u7528\u90ae\u7bb1\u6ce8\u518c"}
              </p>
            </div>

            <div className="space-y-4">
              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <div className="relative">
                  <input
                    type="email"
                    placeholder={"\u8bf7\u8f93\u5165\u90ae\u7bb1\u5730\u5740"}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    className={[
                      registerInputBaseClass,
                      emailTouched && isValidEmail(email)
                        ? registerInputValidClass
                        : registerInputDefaultClass,
                    ].join(" ")}
                    required
                  />
                </div>

                <div className="relative">
                  <input
                    type="password"
                    placeholder={"\u8bf7\u8bbe\u7f6e\u5bc6\u7801"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onBlur={() => setPasswordTouched(true)}
                    className={[
                      registerInputBaseClass,
                      passwordTouched && password.trim()
                        ? registerInputValidClass
                        : registerInputDefaultClass,
                    ].join(" ")}
                    required
                  />
                  <button
                    type="submit"
                    className="group absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                    disabled={sendingCode}
                    aria-label={"\u7ee7\u7eed"}
                  >
                    <span className="relative block h-full w-full overflow-hidden">
                      <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-full">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                      <span className="absolute inset-0 flex -translate-x-full items-center justify-center transition-transform duration-300 group-hover:translate-x-0">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </span>
                  </button>
                </div>
              </form>
            </div>

            <p className="pt-10 text-xs text-white/40">
              {"\u6ce8\u518c\u5373\u8868\u793a\u4f60\u540c\u610f"}
              <Link href="#" className="underline transition-colors hover:text-white/60">
                {"\u300a\u4e3b\u670d\u52a1\u534f\u8bae\u300b"}
              </Link>
              {"\u3001"}
              <Link href="#" className="underline transition-colors hover:text-white/60">
                {"\u300a\u4ea7\u54c1\u6761\u6b3e\u300b"}
              </Link>
              {"\u3001"}
              <Link href="#" className="underline transition-colors hover:text-white/60">
                {"\u300a\u4f7f\u7528\u653f\u7b56\u300b"}
              </Link>
              {"\u3001"}
              <Link href="#" className="underline transition-colors hover:text-white/60">
                {"\u300a\u9690\u79c1\u58f0\u660e\u300b"}
              </Link>
              {"\u548c"}
              <Link href="#" className="underline transition-colors hover:text-white/60">
                {"\u300a\u7f13\u5b58\u58f0\u660e\u300b"}
              </Link>
              {"\u3002"}
            </p>
          </motion.div>
        ) : step === "code" ? (
          <motion.div
            key="code-step"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="space-y-6 text-center"
          >
            <div className="space-y-1">
              <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-normal text-white">
                {"\u9a8c\u8bc1\u7801\u5df2\u53d1\u9001"}
              </h1>
              <p className="text-[1.25rem] font-light text-white/50">
                {"\u8bf7\u8f93\u5165\u9a8c\u8bc1\u7801"}
              </p>
            </div>

            <div className="w-full">
              <div className="relative rounded-full border border-white/10 bg-transparent px-5 py-4">
                <div className="flex items-center justify-center">
                  {code.map((digit, index) => (
                    <div key={index} className="flex items-center">
                      <div className="relative">
                        <input
                          ref={(element) => {
                            codeInputRefs.current[index] = element;
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={digit}
                          onChange={(event) => handleCodeChange(index, event.target.value)}
                          onKeyDown={(event) => handleKeyDown(index, event)}
                          className="w-8 appearance-none border-none bg-transparent text-center text-xl text-white focus:outline-none focus:ring-0"
                          style={{ caretColor: "transparent" }}
                          aria-label={`\u9a8c\u8bc1\u7801\u7b2c ${index + 1} \u4f4d`}
                        />
                        {!digit && (
                          <div className="pointer-events-none absolute left-0 top-0 flex h-full w-full items-center justify-center">
                            <span className="text-xl text-white">0</span>
                          </div>
                        )}
                      </div>
                      {index < 5 && (
                        <span className="text-xl text-white/20">|</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <motion.button
              type="button"
              className="cursor-pointer text-sm text-white/50 transition-colors hover:text-white/70"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                setStep("email");
                setCode(emptyCode());
              }}
            >
              {"\u91cd\u65b0\u53d1\u9001\u9a8c\u8bc1\u7801"}
            </motion.button>

            {error ? (
              <p className="text-sm text-red-300/90">{error}</p>
            ) : null}

            <div className="flex w-full gap-3">
              <motion.button
                onClick={handleBackClick}
                className="w-[30%] rounded-full bg-white px-8 py-3 font-medium text-black transition-colors hover:bg-white/90"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                {"\u8fd4\u56de"}
              </motion.button>
              <motion.button
                onClick={() => void handleCreateAccount()}
                className={[
                  "flex-1 rounded-full border py-3 font-medium transition-all duration-300",
                  code.every((digit) => digit !== "") && !submitting
                    ? "cursor-pointer border-transparent bg-white text-black hover:bg-white/90"
                    : "cursor-not-allowed border-white/10 bg-[#111] text-white/50",
                ].join(" ")}
                disabled={!code.every((digit) => digit !== "") || submitting}
              >
                {submitting ? "\u6ce8\u518c\u4e2d" : "\u7ee7\u7eed"}
              </motion.button>
            </div>

            <div className="pt-16">
              <p className="text-xs text-white/40">
                {"\u6ce8\u518c\u5373\u8868\u793a\u4f60\u540c\u610f"}
                <Link href="#" className="underline hover:text-white/60">
                  {"\u300a\u4e3b\u670d\u52a1\u534f\u8bae\u300b"}
                </Link>
                {"\u3001"}
                <Link href="#" className="underline hover:text-white/60">
                  {"\u300a\u4ea7\u54c1\u6761\u6b3e\u300b"}
                </Link>
                {"\u3001"}
                <Link href="#" className="underline hover:text-white/60">
                  {"\u300a\u4f7f\u7528\u653f\u7b56\u300b"}
                </Link>
                {"\u3001"}
                <Link href="#" className="underline hover:text-white/60">
                  {"\u300a\u9690\u79c1\u58f0\u660e\u300b"}
                </Link>
                {"\u548c"}
                <Link href="#" className="underline hover:text-white/60">
                  {"\u300a\u7f13\u5b58\u58f0\u660e\u300b"}
                </Link>
                {"\u3002"}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="success-step"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.3 }}
            className="space-y-6 text-center"
          >
            <div className="space-y-1">
              <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-normal text-white">
                {"\u767b\u5f55\u6210\u529f"}
              </h1>
              <p className="text-[1.25rem] font-light text-white/50">
                {"\u6b22\u8fce\u4f7f\u7528"}
              </p>
            </div>

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="py-10"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-white to-white/70">
                <Check className="h-8 w-8 text-black" />
              </div>
            </motion.div>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="w-full rounded-full bg-white py-3 font-medium text-black transition-colors hover:bg-white/90"
              onClick={() => onSuccess?.()}
            >
              {"\u7ee7\u7eed\u521b\u4f5c"}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

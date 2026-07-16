"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterFlow } from "@/components/auth/RegisterFlow";
import type { AuthDialogMode } from "@/lib/auth-dialog-return";

interface HomeAuthDialogProps {
  initialMode?: AuthDialogMode;
  open: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
}

export function HomeAuthDialog({
  initialMode = "login",
  open,
  onClose,
  onAuthenticated,
}: HomeAuthDialogProps) {
  const [mode, setMode] = useState<AuthDialogMode>(initialMode);
  const closeDialog = useCallback(() => {
    setMode("login");
    onClose();
  }, [onClose]);
  const completeAuthentication = useCallback(() => {
    setMode("login");
    onAuthenticated();
  }, [onAuthenticated]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDialog();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDialog, open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/76 px-4 py-6 backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={mode === "login" ? "登录" : "注册"}
            className="relative max-h-[calc(100vh-3rem)] w-full max-w-[520px] overflow-y-auto rounded-[8px] border border-[#363636] bg-[#08090b] px-7 py-10 text-white shadow-[0_28px_90px_rgba(0,0,0,0.72)] sm:px-12 sm:py-12"
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <button
              type="button"
              aria-label="关闭登录窗口"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-white/50 transition hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70"
              onClick={closeDialog}
            >
              <X size={18} />
            </button>

            <div className="mx-auto flex w-full justify-center pt-2">
              {mode === "login" ? (
                <LoginForm
                  onSuccess={completeAuthentication}
                  onRegister={() => setMode("register")}
                />
              ) : (
                <div className="w-full max-w-sm">
                  <RegisterFlow onSuccess={completeAuthentication} />
                  <button
                    type="button"
                    className="mt-5 w-full text-center text-sm text-white/48 transition hover:text-white/78"
                    onClick={() => setMode("login")}
                  >
                    已有账号，返回登录
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

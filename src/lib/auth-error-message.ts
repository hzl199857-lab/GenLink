function normalizeErrorMessage(message?: string | null): string {
  return (message || "").trim().toLowerCase();
}

export function getLoginErrorMessage(): string {
  return "邮箱或密码错误，请检查后重试";
}

export function getRegisterFlowErrorMessage(message?: string | null): string {
  const normalized = normalizeErrorMessage(message);

  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "这个邮箱已经注册过，请直接登录";
  }

  if (normalized.includes("expired")) {
    return "验证码已过期，请重新发送";
  }

  if (normalized.includes("verification code") || normalized.includes("invalid")) {
    return "验证码不正确，请重新输入";
  }

  return "操作失败，请稍后重试";
}

export function getRegisterAccountErrorMessage(message?: string | null): string {
  const normalized = normalizeErrorMessage(message);

  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "这个邮箱已经注册过，请直接登录";
  }

  return "注册失败，请稍后重试";
}

"use client"

import { cn } from "@/lib/utils"

interface UniqueLoadingProps {
  variant?: "squares"
  size?: "sm" | "md" | "lg" | "agent" | "agent-sm"
  text?: string
  className?: string
}

export default function UniqueLoading({
  variant = "squares",
  size = "md",
  className,
}: UniqueLoadingProps) {
  const containerSizes = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
    agent: "w-[30px] h-[30px]",
    "agent-sm": "w-[24px] h-[24px]",
  }

  if (variant === "squares") {
    return (
      <div className={cn("relative", containerSizes[size], className)}>
        <div className="grid grid-cols-3 gap-[3px] w-full h-full">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="bg-current animate-pulse"
              style={{
                animationDelay: `${i * 0.1}s`,
                animationDuration: "1.5s",
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  return null
}

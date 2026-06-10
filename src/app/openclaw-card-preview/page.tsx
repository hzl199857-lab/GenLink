import {
  Check,
  ChevronRight,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";

const tasks = [
  "淘宝主图1：一位自信的辣妹模特穿着豹纹紧身连衣裙，正面半身展示。",
  "淘宝主图2：同一位模特穿着同一件豹纹紧身连衣裙，街头穿搭场景。",
  "淘宝主图3：豹纹连衣裙的细节特写，突出面料纹理、腰线和剪裁。",
  "淘宝主图4：模特侧身行走，展示裙摆弧度和上身比例。",
  "淘宝主图5：纯白底商品图，连衣裙平铺与细节组合展示。",
];

const compactTasks = [
  "视觉风格方向：美式辣妹 / High Street",
  "主要投放平台：淘宝 / 天猫",
  "补充说明：突出显瘦、修身、豹纹氛围。",
];

function StatusPill({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#75e2b8]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#75e2b8]" />
      {label}
    </div>
  );
}

function TaskList({ items }: { items: string[] }) {
  return (
    <div className="mt-3 overflow-hidden rounded-[18px] bg-[#2a2b2e]">
      {items.map((item, index) => (
        <button
          key={item}
          type="button"
          className="flex min-h-11 w-full items-center gap-3 border-b border-white/[0.05] px-4 py-2.5 text-left text-[14px] font-semibold leading-5 text-white/92 last:border-b-0 hover:bg-white/[0.035]"
        >
          <span className="shrink-0 text-white">{index + 1}.</span>
          <span className="min-w-0 flex-1 truncate">{item}</span>
          <ChevronRight size={16} className="shrink-0 text-white/42" />
        </button>
      ))}
    </div>
  );
}

function MetaBar({ count }: { count: number }) {
  return (
    <div className="mt-4 flex items-center gap-3 text-[12px] font-semibold text-white/82">
      <span className="inline-flex items-center gap-1.5">
        <Sparkles size={14} className="text-white/46" />
        GPT Image2
      </span>
      <span className="h-3 w-px bg-white/12" />
      <span>1:1</span>
      <span className="h-3 w-px bg-white/12" />
      <span>1K</span>
      <span className="h-3 w-px bg-white/12" />
      <span>低</span>
      <span className="h-3 w-px bg-white/12" />
      <span>{count} 个任务</span>
      <div className="ml-auto h-8 w-8 overflow-hidden rounded-full border border-white/10 bg-[#35363a]">
        <div className="h-full w-full bg-[radial-gradient(circle_at_38%_32%,#b8875a_0_20%,#241b18_21%_42%,#efe4d2_43%_57%,#4a3428_58%_100%)]" />
      </div>
    </div>
  );
}

function OpenClawTaskCard() {
  return (
    <div className="rounded-[18px] bg-[#1f2023] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.26)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-white/62">
            <ImageIcon size={15} />
            图片生成
          </div>
          <div className="mt-3 text-[16px] font-semibold text-white">生成 5 张图片</div>
        </div>
        <StatusPill label="已确认" />
      </div>

      <TaskList items={tasks} />
      <MetaBar count={5} />
    </div>
  );
}

function OpenClawFormCard() {
  return (
    <div className="rounded-[18px] bg-[#1f2023] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.26)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-white/62">
            <ImageIcon size={15} />
            电商图信息确认
          </div>
          <div className="mt-3 text-[16px] font-semibold text-white">还需要确认 3 项</div>
        </div>
        <StatusPill label="待确认" />
      </div>

      <TaskList items={compactTasks} />

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#19d3ff] px-3 text-[13px] font-semibold text-[#061019] hover:bg-[#6ee7ff]"
        >
          <Check size={15} />
          确认提交
        </button>
        <button
          type="button"
          className="h-9 rounded-lg bg-white/[0.06] px-3 text-[13px] font-semibold text-white/68 hover:bg-white/[0.1] hover:text-white"
        >
          修改方向
        </button>
      </div>
    </div>
  );
}

export default function OpenClawCardPreviewPage() {
  return (
    <main className="min-h-screen bg-[#111214] px-6 py-8 text-white">
      <div className="mx-auto max-w-[460px]">
        <div className="mb-5 text-[13px] leading-6 text-white/58">
          独立样例页：只预览 OpenClaw 对话卡片的新视觉，不接入现有 agent 面板。
        </div>
        <div className="space-y-5">
          <OpenClawFormCard />
          <div className="text-[14px] font-semibold leading-6 text-white/90">
            收到，辣妹套装连衣裙的 8 图电商全方案已经准备就绪。
          </div>
          <OpenClawTaskCard />
        </div>
      </div>
    </main>
  );
}

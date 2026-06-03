import { stripReferenceMentionTokens } from "./prompt-mentions";

type BatchPromptVariantOptions = {
  hasReferenceImages?: boolean;
};

type ConcreteVariant = {
  city: string;
  scene: string;
  clothing: string;
  action: string;
  composition: string;
  palette: string;
};

const PORTRAIT_VARIANTS: ConcreteVariant[] = [
  {
    city: "东京",
    scene: "东京夜晚城市街头，霓虹招牌、玻璃橱窗、过街人群与车辆灯光自然虚化",
    clothing: "白色短款夹克、浅色衬衫和米色半身裙",
    action: "侧身步行，手拿一杯咖啡，动作轻松自然",
    composition: "半身到七分身街拍构图，人物位于画面三分线附近",
    palette: "冷暖霓虹交错，肤色自然干净",
  },
  {
    city: "纽约",
    scene: "纽约雨后街角，出租车灯光、湿润柏油路、街边店铺与远处高楼形成层次",
    clothing: "黑色皮夹克、白色内搭、深色直筒裤和短靴",
    action: "回头看向镜头，一只手整理头发，姿态自信从容",
    composition: "低机位轻微仰拍，人物从街角人流中突出",
    palette: "雨夜反光与暖色橱窗形成电影感对比",
  },
  {
    city: "巴黎",
    scene: "巴黎清晨街头，石板路、街边咖啡馆、浅色建筑立面与柔和晨光",
    clothing: "米色风衣、针织上衣、浅色长裙和细跟鞋",
    action: "抬手轻扶帽檐并看向远处，动作优雅安静",
    composition: "中景人像构图，背景建筑线条引导视线",
    palette: "低饱和暖调，清晨光线柔和细腻",
  },
  {
    city: "上海",
    scene: "上海梧桐树街区，老洋房立面、街边栏杆、斑驳树影和城市生活细节",
    clothing: "蓝色针织衫、白色阔腿裤、银色耳饰和小号手提包",
    action: "倚靠在人行道栏杆旁，微微转身看向侧前方，神态自然",
    composition: "竖幅街头肖像构图，前景树影与背景街景形成纵深",
    palette: "自然日光与清爽蓝白色彩关系",
  },
  {
    city: "伦敦",
    scene: "伦敦黄昏街头，红砖建筑、街灯、双层巴士远景和轻微薄雾",
    clothing: "灰色西装外套、酒红色针织内搭、黑色半裙和乐福鞋",
    action: "站在路边抬手招车，身体微微前倾，表情松弛",
    composition: "长焦压缩街景层次，人物清晰突出",
    palette: "黄昏暖光与灰红城市色调",
  },
  {
    city: "首尔",
    scene: "首尔潮流商业街，韩文店招、浅色墙面、街拍人群和干净橱窗",
    clothing: "浅灰连帽卫衣、短款外套、百褶裙和运动鞋",
    action: "边走边转身微笑，手里拿着手机，动作有活力",
    composition: "动态抓拍构图，背景轻微运动虚化",
    palette: "清透日光，年轻明快的城市色彩",
  },
  {
    city: "米兰",
    scene: "米兰时装街区，石质建筑、精品店橱窗、街边长椅和高级商业氛围",
    clothing: "黑白拼色套装、细腰带、墨镜和小牛皮手袋",
    action: "站在橱窗前轻抬下巴，手扶墨镜，姿态利落",
    composition: "时尚杂志式全身构图，留出干净背景空间",
    palette: "高对比黑白与自然肤色",
  },
  {
    city: "洛杉矶",
    scene: "洛杉矶傍晚街区，棕榈树、低矮建筑、金色夕阳和远处车流",
    clothing: "浅色牛仔外套、白色背心、卡其长裤和帆布鞋",
    action: "自然走过斑马线，头发被微风带起，表情放松",
    composition: "逆光街拍构图，人物边缘有柔和轮廓光",
    palette: "金色夕阳与清爽浅色穿搭",
  },
];

const PRODUCT_VARIANTS = [
  {
    color: "象牙白与浅银色配色",
    angle: "45度前侧视角",
    scene: "干净的浅灰摄影棚场景，柔和阴影突出轮廓",
    detail: "鞋面纹理、鞋底缓震结构和透气网面清晰可见",
  },
  {
    color: "深灰与黑色配色",
    angle: "低机位侧后方视角",
    scene: "城市跑道边缘场景，地面有轻微运动痕迹",
    detail: "强调流线型鞋身、后跟支撑和轻量中底",
  },
  {
    color: "银灰与蓝色点缀配色",
    angle: "俯拍三分之二视角",
    scene: "户外晨跑补给台场景，背景干净虚化",
    detail: "突出透气网面、鞋带结构和缓震科技细节",
  },
  {
    color: "奶油白与橄榄绿配色",
    angle: "正面轻微仰视角度",
    scene: "自然日光下的极简运动生活方式场景",
    detail: "突出鞋头包覆、鞋底弹性和材质层次",
  },
  {
    color: "黑白撞色配色",
    angle: "鞋底翻转展示视角",
    scene: "深色运动装备背景，边缘光勾勒产品形态",
    detail: "展示外底纹路、防滑结构和缓震厚度",
  },
  {
    color: "浅紫与雾蓝配色",
    angle: "双鞋交错摆放的正侧视角",
    scene: "明亮电商产品摄影场景，背景简洁",
    detail: "强调轻量鞋身、透气孔位和精致做工",
  },
  {
    color: "红色与炭黑配色",
    angle: "动态悬浮视角",
    scene: "跑步速度感背景，光线形成方向性拖影",
    detail: "突出弹性中底、包裹性能和运动能量感",
  },
  {
    color: "沙色与白色配色",
    angle: "平视全貌视角",
    scene: "户外水泥台面与柔和自然光场景",
    detail: "呈现鞋面织物、鞋侧标识和整体比例",
  },
];

function stripBatchQuantityInstruction(message: string): string {
  return message
    .replace(/(?:请|帮我|给我|需要|生成|创建|做|出)?\s*(?:\d+|[一二两三四五六七八九十]+)\s*(?:张|个|组|款|幅)\s*(?:图|图片|图像|效果图)?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeGenericVariantRequest(message: string): string {
  return message
    .replace(/穿着不同衣服[、,，]?\s*不同动作[、,，]?\s*背景是不同城市的街头/g, "城市街头人像")
    .replace(/不同衣服/g, "多套具体服装")
    .replace(/不同动作/g, "具体动作")
    .replace(/不同城市/g, "具体城市")
    .replace(/不同配色/g, "具体配色")
    .replace(/不同角度/g, "具体拍摄角度")
    .replace(/不同场景/g, "具体场景")
    .replace(/\s+/g, " ")
    .trim();
}

function isPortraitRequest(message: string, hasReferenceImages: boolean): boolean {
  return hasReferenceImages || /人物|人像|模特|女生|男生|女孩|男孩|肖像|穿着|服装|动作|街头|参考图/.test(message);
}

function getBaseRequest(message: string): string {
  const clean = stripBatchQuantityInstruction(stripReferenceMentionTokens(message, []).trim());
  return removeGenericVariantRequest(clean) || "根据用户需求生成高质量图像";
}

function createPortraitPrompt(baseRequest: string, index: number, hasReferenceImages: boolean): string {
  const variant = PORTRAIT_VARIANTS[index % PORTRAIT_VARIANTS.length];
  const identityRule = hasReferenceImages
    ? "参考图人物身份保持一致，准确保留同一人的五官比例、脸型轮廓、发型气质、肤色与自然表情，不改变人物身份。"
    : "主体身份保持一致，人物比例自然，五官稳定，表情真实。";

  return [
    identityRule,
    `具体方案 ${index + 1}：${baseRequest}。`,
    `服装：${variant.clothing}。`,
    `动作：${variant.action}。`,
    `城市与背景：${variant.city}，${variant.scene}。`,
    `构图：${variant.composition}。`,
    `色彩与光线：${variant.palette}。`,
    "保持用户要求的摄影机、镜头、焦段、光圈、风格和核心约束；如果用户指定了镜头参数，必须完整保留。",
    "高质量商业摄影质感，浅景深，真实胶片颗粒，高动态范围，肤色自然细腻，光影层次丰富。",
    "避免文字、水印、畸变、低清晰度、重复构图、脸部变形和明显修图痕迹。",
  ].join(" ");
}

function createProductPrompt(baseRequest: string, index: number): string {
  const variant = PRODUCT_VARIANTS[index % PRODUCT_VARIANTS.length];

  return [
    `具体方案 ${index + 1}：${baseRequest}。`,
    `配色：${variant.color}。`,
    `角度：${variant.angle}。`,
    `场景：${variant.scene}。`,
    `细节：${variant.detail}。`,
    "保持用户指定的产品类型、卖点、材质、功能和品牌调性，主体清晰完整。",
    "高质量商业产品摄影，构图干净，光影自然，边缘锐利，质感真实。",
    "避免文字、水印、畸变、低清晰度、主体残缺和重复构图。",
  ].join(" ");
}

export function createBatchPromptVariants(
  message: string,
  count: number,
  options: BatchPromptVariantOptions = {},
): string[] {
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.min(8, Math.floor(count))) : 1;
  const baseRequest = getBaseRequest(message);
  const portraitRequest = isPortraitRequest(baseRequest, options.hasReferenceImages ?? false);

  return Array.from({ length: safeCount }, (_, index) =>
    portraitRequest
      ? createPortraitPrompt(baseRequest, index, options.hasReferenceImages ?? false)
      : createProductPrompt(baseRequest, index),
  );
}

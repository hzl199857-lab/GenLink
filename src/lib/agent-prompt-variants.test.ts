import assert from "node:assert/strict";
import { test } from "node:test";
import { createBatchPromptVariants } from "./agent-prompt-variants";

test("creates concrete prompts for each requested image variant", () => {
  const prompts = createBatchPromptVariants(
    "让参考图上的人物穿着不同衣服、不同动作，背景是不同城市的街头，阿莱35-I型电影摄影机拍摄，Zeiss Master Prime镜头76mm焦段 f/1.3光圈 创建四张图",
    4,
    { hasReferenceImages: true },
  );

  assert.equal(prompts.length, 4);
  assert.equal(new Set(prompts).size, 4);

  const cities = ["东京", "纽约", "巴黎", "上海"];
  const clothing = ["白色短款夹克", "黑色皮夹克", "米色风衣", "蓝色针织衫"];
  const actions = ["步行", "回头", "抬手", "倚靠"];

  prompts.forEach((prompt, index) => {
    assert.match(prompt, /参考图人物身份保持一致|主体身份保持一致/);
    assert.match(prompt, /阿莱35-I型电影摄影机/);
    assert.match(prompt, /Zeiss Master Prime/);
    assert.match(prompt, /76mm/);
    assert.match(prompt, /f\/1\.3/);
    assert.match(prompt, new RegExp(cities[index]));
    assert.match(prompt, new RegExp(clothing[index]));
    assert.match(prompt, new RegExp(actions[index]));
    assert.doesNotMatch(prompt, /不同衣服、不同动作，背景是不同城市/);
  });
});

test("keeps user-specified product constraints while concretizing generic variant requests", () => {
  const prompts = createBatchPromptVariants(
    "为这款运动鞋生成三张图，分别是不同配色、不同角度、不同场景，突出轻量缓震和透气网面",
    3,
    { hasReferenceImages: false },
  );

  assert.equal(prompts.length, 3);

  prompts.forEach((prompt) => {
    assert.match(prompt, /运动鞋/);
    assert.match(prompt, /轻量缓震/);
    assert.match(prompt, /透气网面/);
    assert.match(prompt, /具体方案/);
  });

  assert.match(prompts[0], /象牙白|白色/);
  assert.match(prompts[1], /深灰|黑色/);
  assert.match(prompts[2], /银灰|蓝色/);
});

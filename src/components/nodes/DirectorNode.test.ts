import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { ReactElement, ReactNode } from "react";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".tsx"] = (module: NodeModule, filename: string) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true,
    },
    fileName: filename,
  });

  (module as NodeModule & { _compile: (code: string, filename: string) => void })
    ._compile(output.outputText, filename);
};

const React = require("react") as typeof import("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { DirectorNode } = require("./DirectorNode.tsx") as typeof import("./DirectorNode");

type TestElement = ReactElement<{ children?: ReactNode }>;

function findElementByType(element: ReactNode, type: string): TestElement | null {
  if (!React.isValidElement(element)) {
    return null;
  }

  if (element.type === type) {
    return element as TestElement;
  }

  const children = (element.props as { children?: ReactNode }).children;
  const childList = Array.isArray(children) ? children : [children];

  for (const child of childList) {
    const result = findElementByType(child, type);
    if (result) {
      return result;
    }
  }

  return null;
}

test("renders director console as a canvas entry node", () => {
  const html = renderToStaticMarkup(
    React.createElement(DirectorNode, {
      data: { title: "\u5bfc\u6f14\u53f0" },
      selected: false,
    }),
  );

  assert.match(html, /\u5bfc\u6f14\u53f0/u);
  assert.match(html, /\u57283D\u7a7a\u95f4\u4e2d\u642d\u5efa\u573a\u666f\u5e76\u8fdb\u884c\u591a\u89c6\u89d2\u622a\u56fe/u);
  assert.match(html, /\u6253\u5f00\u5bfc\u6f14\u53f0/u);
  assert.match(html, /aria-label="\u6253\u5f00\u5bfc\u6f14\u53f0"/u);
});

test("renders without card or placeholder button borders", () => {
  const html = renderToStaticMarkup(
    React.createElement(DirectorNode, {
      data: { title: "\u5bfc\u6f14\u53f0" },
      selected: true,
    }),
  );

  assert.doesNotMatch(html, /\bborder\b/);
  assert.doesNotMatch(html, /\bring-/);
  assert.doesNotMatch(html, /shadow-\[0_0_0_1px/);
});

test("uses the image generation panel background in every selection state", () => {
  for (const selected of [false, true]) {
    const html = renderToStaticMarkup(
      React.createElement(DirectorNode, {
        data: { title: "\u5bfc\u6f14\u53f0" },
        selected,
      }),
    );

    assert.match(html, /\bbg-gl-panel\b/);
    assert.doesNotMatch(html, /bg-\[#(?:1f1f20|242425)\]/);
  }
});

test("calls onOpen from the director desk button", () => {
  let openCount = 0;
  let prevented = false;
  let stopped = false;
  const element = DirectorNode({
    data: { title: "\u5bfc\u6f14\u53f0" },
    selected: false,
    onOpen: () => {
      openCount += 1;
    },
  });
  const button = findElementByType(element, "button");

  assert.ok(button);
  (button.props as {
    onClick: (event: { preventDefault: () => void; stopPropagation: () => void }) => void;
  }).onClick({
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    },
  });

  assert.equal(openCount, 1);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
});

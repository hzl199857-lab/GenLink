export function shouldFocusNodeOnDoubleClick(nodeType: string | undefined): boolean {
  return nodeType !== 'text';
}

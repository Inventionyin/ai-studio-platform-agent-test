export function confirmDelete(name: string): boolean {
  return window.confirm(`确定删除「${name}」？此操作不可撤销。`);
}

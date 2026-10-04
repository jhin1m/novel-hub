/** Đọc một field text từ form; field không có thì trả chuỗi rỗng. */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

/** Focuses the global search field (shortcut "/"). */
export function focusSearch() {
  const input = document.querySelector<HTMLInputElement>('.topbar input[type="search"]')
  input?.focus()
  input?.select()
}

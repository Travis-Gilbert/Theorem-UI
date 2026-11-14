/** Exercise the installed Base UI Select through its trigger and portal. */
export async function chooseOption(page, scope, label, option) {
  await scope.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

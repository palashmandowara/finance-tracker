export function inr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}
export function balance(opening: number, income: number, expense: number) {
  return opening + income - expense;
}

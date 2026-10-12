// Turns an API error into a message for the user. Validation errors list
// each problem, for example "Username must be at least 3 characters".
export function getErrorMessage(error, fallback) {
  const data = error.response?.data;

  if (data?.details?.length) {
    return data.details.map((detail) => detail.message).join(". ");
  }

  return data?.error || fallback;
}

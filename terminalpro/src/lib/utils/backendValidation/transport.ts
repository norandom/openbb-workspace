export async function fetchWidgetCatalog(widgetsUrl: URL, reqInit: RequestInit) {
  const widgetsRes = await fetch(widgetsUrl, reqInit).catch((error) => ({
    ok: false,
    status: error.code || 500,
    statusText: error.message || "Network error",
    json: async () => ({}),
    headers: new Headers(),
  }));

  if (!widgetsRes.ok) {
    const statusCode = widgetsRes.status;
    let errorMessage =
      "Unable to find a widgets.json file. Please check the console logs for more details.";

    // Handle specific status codes with more descriptive messages
    if (statusCode === 401 || statusCode === 403) {
      errorMessage =
        "Authentication failed. Please check your Authorization header or check the console logs for more details.";
    } else if (statusCode === 404) {
      errorMessage = "The widgets.json file was not found on the server.";
    } else if (statusCode === 422) {
      errorMessage =
        "The server rejected the request. Please check your Authorization header or check the console logs for more details.";
    } else if (statusCode >= 500) {
      errorMessage =
        "Server error occurred. Please try again later or check the console logs for more details.";
    } else if (statusCode === 23) {
      errorMessage = "Request timed out. Please check server status or try again.";
    }

    throw new Error(`${errorMessage} (Status: ${statusCode})`);
  }

  return widgetsRes;
}

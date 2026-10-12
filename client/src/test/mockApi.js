import { AxiosError } from "axios";

import api from "../services/api";

const originalAdapter = api.defaults.adapter;

// Answers api requests from a map of "METHOD /url" to handlers returning
// [status, data], so tests run without a server.
export function mockApi(routes) {
  const requests = [];

  api.defaults.adapter = async (config) => {
    const route = `${config.method.toUpperCase()} ${config.url}`;
    const handler = routes[route];

    if (!handler) {
      throw new Error(`Unexpected request: ${route}`);
    }

    const body = config.data ? JSON.parse(config.data) : undefined;

    requests.push({ route, body });

    const [status, data] = handler(body);

    const response = { status, data, headers: {}, config, statusText: "" };

    if (status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${status}`,
        undefined,
        config,
        null,
        response,
      );
    }

    return response;
  };

  return requests;
}

export function restoreApi() {
  api.defaults.adapter = originalAdapter;
}

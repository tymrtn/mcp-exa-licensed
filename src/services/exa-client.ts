import axios, { AxiosInstance } from "axios";
import type { ExaSearchRequest, ExaSearchResponse, ExaContentsRequest, ExaContentsResponse } from "../types.js";

export class ExaClient {
  private axiosInstance: AxiosInstance;

  constructor(apiKey: string, baseUrl: string = "https://api.exa.ai") {
    if (!apiKey) {
      throw new Error("EXA_API_KEY is required");
    }

    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
    });
  }

  async search(body: ExaSearchRequest): Promise<ExaSearchResponse> {
    const response = await this.axiosInstance.post("/search", body);
    return response.data as ExaSearchResponse;
  }

  async contents(body: ExaContentsRequest): Promise<ExaContentsResponse> {
    const response = await this.axiosInstance.post("/contents", body);
    return response.data as ExaContentsResponse;
  }
}












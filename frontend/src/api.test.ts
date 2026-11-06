import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getMe, sendCustomerMessage } from "./api";

describe("API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends customer messages with cookies and JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ draft_status: "ready" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendCustomerMessage(
      { id: "cust_1", name: "Aisha", phone: "+919800000001" },
      "What is your return policy?"
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/customer/messages",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: expect.stringContaining("What is your return policy?")
      })
    );
  });

  it("surfaces API detail and status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Sign in required" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    await expect(getMe()).rejects.toMatchObject({
      message: "Sign in required",
      status: 401
    } satisfies Partial<ApiError>);
  });
});


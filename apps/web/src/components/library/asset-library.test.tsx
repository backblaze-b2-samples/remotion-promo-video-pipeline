import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Rendered as static markup (no jsdom): both loading branches of `/library` are
// pure output, so server rendering is enough to assert what the user reads.
vi.mock("@/lib/queries", () => ({
  useProducts: vi.fn(),
  useAssetLibrary: vi.fn(),
  useCreateDemoAudio: vi.fn(),
}));

import { AssetLibrary } from "./asset-library";
import { useAssetLibrary, useCreateDemoAudio, useProducts } from "@/lib/queries";

const mocked = {
  products: vi.mocked(useProducts),
  library: vi.mocked(useAssetLibrary),
  audio: vi.mocked(useCreateDemoAudio),
};

function stubQueries({ productsLoading }: { productsLoading: boolean }) {
  mocked.products.mockReturnValue({
    data: productsLoading ? undefined : { products: ["demo-product"], default: "demo-product" },
    isLoading: productsLoading,
  } as ReturnType<typeof useProducts>);
  mocked.library.mockReturnValue({
    data: undefined,
    isLoading: true,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useAssetLibrary>);
  mocked.audio.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useCreateDemoAudio>);
}

// `/library`'s wait is multi-second (the product list is two B2 prefix listings,
// and the scoped `/assets` fetch cannot start until it resolves). Bare grey
// skeleton bars told the user nothing, while the sibling `/promos` table already
// named the B2 read it was doing. Both `/library` skeleton states must stay
// labelled with the read in flight.
describe("asset library loading copy", () => {
  it("names the B2 prefixes it lists while the product list loads", () => {
    stubQueries({ productsLoading: true });

    const html = renderToStaticMarkup(<AssetLibrary />);

    expect(html).toContain("role=\"status\"");
    expect(html).toContain("Listing ");
    expect(html).toContain("assets/");
    expect(html).toContain("storyboards/");
    expect(html).toContain("in B2 to find which products exist");
  });

  it("names the scoped prefix while that product's assets load", () => {
    stubQueries({ productsLoading: false });

    const html = renderToStaticMarkup(<AssetLibrary />);

    expect(html).toContain("role=\"status\"");
    expect(html).toContain("assets/demo-product/");
    expect(html).toContain("captures, brand files, the audio bed and SFX");
  });
});

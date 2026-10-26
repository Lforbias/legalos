import type { MetadataRoute } from "next";
import { publicUrl } from "@/lib/audience/policy";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/produto", "/blog", "/ferramentas", "/comunidade"],
      disallow: [
        "/admin",
        "/api/",
        "/acesso",
        "/minha-conta",
        "/login",
        "/register",
        "/portal",
        "/transparencia",
      ],
    },
    sitemap: publicUrl("/sitemap.xml"),
  };
}

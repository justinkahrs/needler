import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const repositoryName =
  process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "needler";
const githubPagesPath = `/${repositoryName}`;

const nextConfig: NextConfig = {
  output: "export",
  basePath: isGitHubPages ? githubPagesPath : undefined,
  assetPrefix: isGitHubPages ? `${githubPagesPath}/` : undefined,
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ["192.168.1.87"],
};

export default nextConfig;

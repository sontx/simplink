---
type: goal
title: Run the KB tools in a Docker container
summary: Package the KB with the MCP HTTP server as a Docker image, and run it as a shared service for agents.
aliases:
  - triển khai MCP server bằng Docker
  - đóng gói KB vào container
  - deploy the MCP server with Docker
  - docker image for the KB
  - container for KB tools
when_to_use:
  - Người dùng muốn chạy máy chủ MCP của KB trên máy chủ hoặc cụm container.
  - User wants a container image that serves the KB tools over HTTP with a health check.
procedures:
  - procedure.mcp.deploy-docker
sources:
  - Dockerfile
  - README.md
---

The user wants to deploy the KB tools as a container instead of running `simp-mcp-http` directly on a host.

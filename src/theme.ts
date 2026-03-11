export function getExcalidrawTheme(): "light" | "dark" {
  const excalidrawEl = document.querySelector(".excalidraw");
  if (excalidrawEl?.classList.contains("theme--dark")) return "dark";
  return "light";
}

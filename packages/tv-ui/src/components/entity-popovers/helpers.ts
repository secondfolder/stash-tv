/** Whether an entity's image (its `image_path`) is Stash's stand-in for one, as it has no image of its own */
export function hasDefaultImage(imagePath: string | null | undefined) {
  if (!imagePath) return true
  return new URL(imagePath, location.origin).searchParams.get("default") === "true"
}

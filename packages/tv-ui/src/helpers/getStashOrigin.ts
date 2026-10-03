export const getStashOrigin = () => import.meta.env.STASH_ADDRESS || location.origin

/** The URL of a page in Stash, from its path (e.g. `/tags/1`) */
export const getStashUrl = (path: string) => new URL(path, getStashOrigin()).toString()

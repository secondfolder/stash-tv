export function getFunctionFromString(functionString: string | undefined): Function | Error | null {
  if (!functionString?.trim()) return null
  try {

    // Parentheses to allow anonymous functions
    const evalResult = eval(`(${functionString})`)
    if (typeof evalResult !== "function") {
      return Error(`Type is a ${typeof evalResult}, not a function`)
    }
    return evalResult
  } catch(error) {
    return Error(`Not a valid function (${error})`, {cause: error})
  }
}

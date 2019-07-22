export function setProperty<T>(instance: object, property: string, value: T) {
  (instance as any)[property] = value
}

export function getProperty<T = unknown>(instance: object, property: string): T {
  return (instance as any)[property]
}

export function deleteProperty(instance: object, property: string): void {
  delete (instance as any)[property]
}

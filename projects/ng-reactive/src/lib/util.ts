export function setProperty<T>(instance: object, property: string, value: T) {
  (instance as any)[property] = value
}

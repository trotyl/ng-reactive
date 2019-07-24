import { AfterViewChecked, ChangeDetectorRef, Injectable, Injector, OnChanges, OnDestroy, OnInit, SimpleChange, SimpleChanges, Type } from '@angular/core'
import { Observable } from 'rxjs'
import { instanceRecords, protoRecords, InstanceMeta, InstanceMetaKey, InstancePropertyMeta, InstancePropertyMetaKey, ProtoMetaKey, ProtoPropertyMetaKey } from './metadata'
import { deleteProperty, getProperty, setProperty } from './util'

export interface State<T> {
  __ng_reactive_state: boolean
  data: T
  source: Observable<T> | null
}

export function state<T>(value: T): T {
  return {
    __ng_reactive_state: true,
    data: value,
    source: null,
  } as State<T> as any
}

function isReactiveState(value: unknown): value is State<unknown> {
  return value != null && typeof value === 'object' && (value as any).__ng_reactive_state != null
}

let activeInstance: object | null = null
let activeProperty: string | null = null

let pendingBindingProperties: string[] = []
let pendingBindingSources: Observable<unknown>[] = []

export function init(instance: object, injector: Injector): void {
  let instanceMeta = instanceRecords.get(instance)
  if (instanceMeta != null) {
    if (instanceMeta[InstanceMetaKey.patched]) { return }
  } else {
    instanceMeta = [false, false, Object.create(null)] as InstanceMeta
    instanceRecords.set(instance, instanceMeta)
  }

  const properties = Object.keys(instance)
  const cdRef = injector.get(ChangeDetectorRef as Type<ChangeDetectorRef>)

  for (let i = 0; i < properties.length; i++) {
    const property = properties[i]
    const content = getProperty(instance, property)
    if (!isReactiveState(content)) { continue }

    const defaultValue = content.data
    instanceMeta[InstanceMetaKey.properties][property] = [defaultValue, defaultValue, null, false, 0, null] as InstancePropertyMeta

    deleteProperty(instance, property)
    const field = patchProtoProperty(instance, property, cdRef)
    field.set(instance, defaultValue)

    if (content.source != null) {
      pendingBindingProperties.push(property)
      pendingBindingSources.push(content.source)
    }
  }

  instanceMeta[InstanceMetaKey.patched] = true

  for (let i = 0; i < pendingBindingProperties.length; i++) {
    const property = pendingBindingProperties[i]
    const source = pendingBindingSources[i]
    const propertyMeta = instanceMeta[InstanceMetaKey.properties][property]

    if (propertyMeta == null) {
      throw new Error(`Property patched failed for unknown reason!`)
    }

    propertyMeta[InstancePropertyMetaKey.subscription] = source.subscribe(value => {
      setProperty(instance, property, value)
    })
  }

  pendingBindingProperties = []
  pendingBindingSources = []
}

function patchProtoProperty(instance: object, property: string, cdRef: ChangeDetectorRef): WeakMap<object, unknown> {
  const proto = Object.getPrototypeOf(instance)
  let protoMeta = protoRecords.get(proto)
  let field: WeakMap<object, unknown>

  if (protoMeta != null) {
    let propertyMeta = protoMeta[ProtoMetaKey.properties][property]
    if (propertyMeta != null) {
      return propertyMeta[ProtoPropertyMetaKey.field]
    } else {
      field = new WeakMap<object, unknown>()
      propertyMeta = [field]
    }
  } else {
    protoMeta = [false, Object.create(null)]
    protoRecords.set(proto, protoMeta)
    field = new WeakMap<object, unknown>()
  }

  protoMeta[ProtoMetaKey.properties][property] = [field]

  Object.defineProperty(proto, property, {
    set(value: unknown) {
      if (isReactiveState(value)) {
        Object.defineProperty(this, property, {
          writable: true,
          configurable: true,
          enumerable: true,
          value,
        })
        return
      }

      const instanceMeta = instanceRecords.get(this)
      if (instanceMeta == null) {
        throw new Error(`Instance not patched but used for reactive state!`)
      }

      instanceMeta[InstanceMetaKey.hasPendingChange] = true

      const propertyMeta = instanceMeta[InstanceMetaKey.properties][property]
      propertyMeta[InstancePropertyMetaKey.previousValue] = propertyMeta[InstancePropertyMetaKey.currentValue]
      propertyMeta[InstancePropertyMetaKey.currentValue] = value
      propertyMeta[InstancePropertyMetaKey.hasPendingChange] = true
      propertyMeta[InstancePropertyMetaKey.changesCount]++

      field.set(this, value)
      cdRef.markForCheck()
    },
    get(): unknown {
      activeInstance = this
      activeProperty = property
      return field.get(this)
    },
  })

  return field
}

export function inited(instance: object): boolean {
  if (instanceRecords.has(instance)) {
    return instanceRecords.get(instance)![InstanceMetaKey.patched]
  }
  return false
}

export function deinit(instance: object): void {
  const instanceMeta = instanceRecords.get(instance)

  if (instanceMeta == null) {
    return
  }

  const propertyMetaMap = instanceMeta[InstanceMetaKey.properties]
  const properties = Object.keys(propertyMetaMap)

  for (let i = 0; i < properties.length; i++) {
    const property = properties[i]
    const subscription = propertyMetaMap[property][InstancePropertyMetaKey.subscription]
    if (subscription != null) {
      subscription.unsubscribe()
    }
  }

  instanceMeta[InstanceMetaKey.properties] = Object.create(null)
  instanceRecords.delete(instance)
}

export function bind<T>(target: T, source: Observable<T>): void {
  if (isReactiveState(target)) {
    target.source = source
    return
  }

  if (activeInstance == null || activeProperty == null) {
    throw new Error(`The property to bind is not properly initialized!`)
  }

  const instance = activeInstance
  const property = activeProperty

  const instanceMeta = instanceRecords.get(instance)
  if (instanceMeta == null) {
    throw new Error(`The property to bind is not properly initialized!`)
  }

  const propertyMeta = instanceMeta[InstanceMetaKey.properties][property]
  if (propertyMeta == null) {
    throw new Error(`The property to bind is not properly initialized!`)
  }

  const subscription = propertyMeta[InstancePropertyMetaKey.subscription]
  if (subscription != null) {
    subscription.unsubscribe()
  }
  propertyMeta[InstancePropertyMetaKey.subscription] = source.subscribe(value => {
    setProperty(instance, property, value)
  })

  activeInstance = null
  activeProperty = null
}

export function unbind<T>(target: T): void {
  if (isReactiveState(target)) {
    target.source = null
    return
  }

  if (activeInstance == null || activeProperty == null) {
    throw new Error(`The property to unbind is not properly initialized!`)
  }

  const instance = activeInstance
  const property = activeProperty

  const instanceMeta = instanceRecords.get(instance)
  if (instanceMeta == null) {
    throw new Error(`The property to unbind is not properly initialized!`)
  }

  const propertyMeta = instanceMeta[InstanceMetaKey.properties][property]
  if (propertyMeta == null) {
    throw new Error(`The property to unbind is not properly initialized!`)
  }

  const subscription = propertyMeta[InstancePropertyMetaKey.subscription]
  if (subscription != null) {
    subscription.unsubscribe()
    propertyMeta[InstancePropertyMetaKey.subscription] = null
  }
}

export function reset<T>(target: T): void {
  if (isReactiveState(target)) {
    return
  }

  if (activeInstance == null || activeProperty == null) {
    throw new Error(`The property to reset is not properly initialized!`)
  }

  const instance = activeInstance
  const property = activeProperty

  const instanceMeta = instanceRecords.get(instance)
  if (instanceMeta == null) {
    throw new Error(`The property to unbind is not properly initialized!`)
  }

  const propertyMeta = instanceMeta[InstanceMetaKey.properties][property]
  if (propertyMeta == null) {
    throw new Error(`The property to unbind is not properly initialized!`)
  }

  setProperty(instance, property, propertyMeta[InstancePropertyMetaKey.defaultValue])
}

let viewActions: (() => void)[] | null = null

export function updateOn(...changes: (StateChange<any> | null | undefined)[]): boolean {
  return changes.some(change => change != null)
}

export function viewUpdate(callback: () => void) {
  if (viewActions == null) {
    throw new Error(`Cannot schedule view change outside "update" method!`)
  }

  viewActions.push(callback)
}

function getReactiveChanges(instance: object): SimpleChanges {
  const instanceMeta = instanceRecords.get(instance)
  if (instanceMeta == null) {
    throw new Error(`The property to unbind is not properly initialized!`)
  }

  if (!instanceMeta[InstanceMetaKey.hasPendingChange]) {
    return {}
  }

  const result: SimpleChanges = {}
  const propertyMetaMap = instanceMeta[InstanceMetaKey.properties]
  const properties = Object.keys(propertyMetaMap)

  for (let i = 0; i < properties.length; i++) {
    const property = properties[i]
    const propertyMeta = propertyMetaMap[property]

    if (propertyMeta[InstancePropertyMetaKey.hasPendingChange]) {
      result[property] = new SimpleChange(
        propertyMeta[InstancePropertyMetaKey.previousValue],
        propertyMeta[InstancePropertyMetaKey.currentValue],
        propertyMeta[InstancePropertyMetaKey.changesCount] === 1,
      )
    }
  }

  instanceMeta[InstanceMetaKey.hasPendingChange] = false

  return result
}

export interface StateChange<T> {
  previousValue: T
  currentValue: T
  firstChange: boolean
}

export type StateChanges<T> = {
  [prop in keyof T]: StateChange<T[prop]>;
}

const pendingChangesRecord = new WeakMap<object, SimpleChanges>()

@Injectable()
export abstract class Reactive implements AfterViewChecked, OnChanges, OnDestroy, OnInit {
  private __injector: Injector
  private __viewActions: (() => void)[] = []

  constructor(injector: Injector) {
    this.__injector = injector
  }

  abstract update(changes: StateChanges<this>, first: boolean): void

  ngOnChanges(changes: SimpleChanges): void {
    pendingChangesRecord.set(this, changes)
  }

  ngOnInit(): void {
    init(this, this.__injector)

    const changes = pendingChangesRecord.get(this) || {}
    viewActions = []
    this.__invokeUpdateFn(changes, true)
    pendingChangesRecord.delete(this)
  }

  ngDoCheck(): void {
    let changes = getReactiveChanges(this)

    if (pendingChangesRecord.has(this)) {
      const ngChanges = pendingChangesRecord.get(this)!
      pendingChangesRecord.delete(this)
      changes = { ...ngChanges, ...changes }
    }

    if (Object.keys(changes).length > 0) {
      this.__invokeUpdateFn(changes, false)
    }
  }

  ngAfterViewChecked(): void {
    for (let i = 0; i < this.__viewActions.length; i++) {
      this.__viewActions[i]()
    }
    this.__viewActions = []
  }

  ngOnDestroy(): void {
    deinit(this)
  }

  private __invokeUpdateFn(changes: SimpleChanges, first: boolean) {
    viewActions = []
    this.update(changes as any, first)
    this.__viewActions.push(...viewActions)
    viewActions = null
  }
}

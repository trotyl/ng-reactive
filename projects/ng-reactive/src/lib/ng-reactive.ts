import { AfterViewChecked, ChangeDetectorRef, Injectable, Injector, OnChanges, OnDestroy, OnInit, SimpleChange, SimpleChanges, Type } from '@angular/core'
import { Observable, Subscription } from 'rxjs'

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

const protoPatchRecord = new WeakMap<object, Map<string, WeakMap<object, unknown>>>()
const instanceInitRecord = new WeakSet()

interface StateMeta<T = unknown> {
  defaultValue: T
  currentValue: T
  previousValue: T | null
  hasPendingChange: boolean
  changesCount: number
  subscription: Subscription | null
}

const stateMetaRecord = new WeakMap<object, Map<string, StateMeta>>()

function setStateMeta(instance: object, property: string, meta: StateMeta): void {
  let map = stateMetaRecord.get(instance)

  if (map == null) {
    map = new Map<string, StateMeta>()
    stateMetaRecord.set(instance, map)
  }

  map.set(property, meta)
}

function getStateMetaList(instance: object): Map<string, StateMeta> {
  return stateMetaRecord.get(instance)!
}

let pendingBindings: [string, Observable<unknown>][] = []

export function init(instance: object, injector: Injector): void {
  if (instanceInitRecord.has(instance)) { return }

  const properties = Object.keys(instance)
  const cdRef = injector.get(ChangeDetectorRef as Type<ChangeDetectorRef>)

  for (let i = 0; i < properties.length; i++) {
    const property = properties[i]
    const content = (instance as any)[property]
    if (!isReactiveState(content)) { continue }

    const defaultValue = content.data
    const stateMeta: StateMeta = {
      defaultValue,
      currentValue: defaultValue,
      previousValue: null,
      hasPendingChange: false,
      changesCount: 0,
      subscription: null,
    }
    setStateMeta(instance, property, stateMeta)

    const proto = Object.getPrototypeOf(instance)
    let patches = protoPatchRecord.get(proto)

    let noPatch = false
    let field: WeakMap<object, unknown>
    if (patches) {
      if (patches.has(property)) {
        field = patches.get(property)!
        noPatch = true
      } else {
        field = new WeakMap<object, unknown>()
      }
    } else {
      patches = new Map<string, WeakMap<object, unknown>>()
      protoPatchRecord.set(proto, patches)
      field = new WeakMap<object, unknown>()
    }

    delete (instance as any)[property]
    field.set(instance, defaultValue)

    if (content.source != null) {
      pendingBindings.push([property, content.source])
    }

    if (noPatch) { continue }

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
        const meta = getStateMetaList(this)!.get(property)!
        meta.previousValue = meta.currentValue
        meta.currentValue = value
        meta.hasPendingChange = true
        meta.changesCount++
        field.set(this, value)
        cdRef.markForCheck()
      },
      get() {
        activeInstance = this
        activeProperty = property
        return field.get(this)
      },
    })

    patches.set(property, field)
  }

  instanceInitRecord.add(instance)

  for (let i = 0; i < pendingBindings.length; i++) {
    const [property, source] = pendingBindings[i]
    const metaList = getStateMetaList(instance)
    const meta = metaList.get(property)!
    meta.subscription = source.subscribe(value => {
      (instance as any)[property] = value
    })
  }

  pendingBindings = []
}

export function inited(instance: object): boolean {
  return instanceInitRecord.has(instance)
}

export function deinit(instance: object): void {
  const metaList = getStateMetaList(instance)
  metaList.forEach(meta => {
    if (meta.subscription != null) {
      meta.subscription.unsubscribe()
    }
  })
  metaList.clear()
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

  const metaList = getStateMetaList(instance)
  const meta = metaList.get(property)!
  if (meta.subscription != null) {
    meta.subscription.unsubscribe()
  }
  meta.subscription = source.subscribe(value => {
    (instance as any)[property] = value
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

  const metaList = getStateMetaList(instance)
  const meta = metaList.get(property)!

  if (meta.subscription != null) {
    meta.subscription.unsubscribe()
    meta.subscription = null
  }
}

let viewActions: (() => void)[] | null = null

export function updateOn(...changes: (StateChange<any> | null | undefined)[]): boolean {
  return changes.some(change => change != null)
}

export function viewUpdate(callback: () => void) {
  if (viewActions == null) {
    throw new Error(`Cannot schedule view change outside "handleUpdate" method!`)
  }

  viewActions.push(callback)
}

function getReactiveChanges(instance: object): SimpleChanges {
  const result: SimpleChanges = {}

  const metaList = getStateMetaList(instance)
  metaList.forEach((meta, property) => {
    if (meta.hasPendingChange) {
      result[property] = new SimpleChange(meta.previousValue, meta.currentValue, meta.changesCount === 1)
      meta.hasPendingChange = false
    }
  })

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

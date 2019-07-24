import { Subscription } from 'rxjs'

export const enum InstanceMetaKey {
  patched,
  hasPendingChange,
  properties,
}

export interface InstanceMeta extends Array<unknown> {
  [InstanceMetaKey.patched]: boolean
  [InstanceMetaKey.hasPendingChange]: boolean
  [InstanceMetaKey.properties]: { [property: string]: InstancePropertyMeta }
}

export const enum ProtoMetaKey {
  patched,
  properties,
}

export interface ProtoMeta extends Array<unknown> {
  [ProtoMetaKey.patched]: boolean
  [ProtoMetaKey.properties]: { [property: string]: ProtoPropertyMeta }
}

export const enum InstancePropertyMetaKey {
  defaultValue,
  currentValue,
  previousValue,
  hasPendingChange,
  changesCount,
  subscription,
}

export interface InstancePropertyMeta<T = unknown> extends Array<unknown> {
  [InstancePropertyMetaKey.defaultValue]: T
  [InstancePropertyMetaKey.currentValue]: T
  [InstancePropertyMetaKey.previousValue]: T | null
  [InstancePropertyMetaKey.hasPendingChange]: boolean
  [InstancePropertyMetaKey.changesCount]: number
  [InstancePropertyMetaKey.subscription]: Subscription | null
}

export const enum ProtoPropertyMetaKey {
  field = 0,
}

export interface ProtoPropertyMeta extends Array<unknown> {
  [ProtoPropertyMetaKey.field]: Field
}

type Field = WeakMap<object, unknown>


export const instanceRecords = new WeakMap<object, InstanceMeta>()
export const protoRecords = new WeakMap<object, ProtoMeta>()

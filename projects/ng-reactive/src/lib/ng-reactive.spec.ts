// tslint:disable:no-use-before-declare

import { ChangeDetectionStrategy, Component, Injector } from '@angular/core'
import { async, ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { Subject } from 'rxjs'
import { map } from 'rxjs/operators'
import { bind, deinit, init, reset, state, updateOn, Reactive, StateChanges } from './ng-reactive'

describe('without base class', () => {
  @Component({
    template: `{{foo}}-{{bar}}-{{baz}}`,
  })
  class TestComponent {
    foo = state(0)
    bar = state(1)
    baz = state(2)

    constructor(private injector: Injector) {
      bind(this.baz, source.pipe(map(x => x + 1)))
    }

    ngOnInit() {
      init(this, this.injector)

      bind(this.bar, source)
    }

    ngOnDestroy() {
      deinit(this)
    }
  }

  let component: TestComponent
  let fixture: ComponentFixture<TestComponent>
  let source: Subject<number>

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ TestComponent ]
    })
    .compileComponents()
  }))

  beforeEach(() => {
    source = new Subject<number>()
    fixture = TestBed.createComponent(TestComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should set initial value', () => {
    expect(component.foo).toBe(0)
    expect(component.bar).toBe(1)
  })

  it('should support assigning value', () => {
    component.foo = 10

    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toBe('10-1-2')
  })

  it('should update binding value', () => {
    source.next(11)
    expect(component.bar).toBe(11)

    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toBe('0-11-12')
  })

  it('should reset state', () => {
    component.foo = 10
    fixture.detectChanges()

    reset(component.foo)
    fixture.detectChanges()

    expect(component.foo).toBe(0)
  })
})

describe('with base class', () => {
  @Component({
    template: `{{foo}}-{{bar}}`,
  })
  class TestComponent extends Reactive {
    foo = state(0)
    bar = state(1)
    baz = state(2)
    flag = false

    constructor(injector: Injector) {
      super(injector)
    }

    update(cgs: StateChanges<this>, first: boolean): void {
      if (first) {
        bind(this.foo, source)
        bind(this.bar, source.pipe(map(x => x + 1)))
      }

      if (updateOn(cgs.baz)) {
        this.flag = true
      }
    }
  }

  let component: TestComponent
  let fixture: ComponentFixture<TestComponent>
  let source: Subject<number>

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ TestComponent ]
    })
    .compileComponents()
  }))

  beforeEach(() => {
    source = new Subject<number>()
    fixture = TestBed.createComponent(TestComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should set initial value', () => {
    expect(component.foo).toBe(0)
    expect(component.bar).toBe(1)
  })

  it('should update binding value', () => {
    source.next(10)

    expect(component.foo).toBe(10)
    expect(component.bar).toBe(11)

    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toBe('10-11')
  })

  it('should respond on changes', () => {
    expect(component.flag).toBe(false)

    component.baz = 10
    fixture.detectChanges()
    expect(component.flag).toBe(true)
  })

  it('should reset state', () => {
    component.foo = 10
    fixture.detectChanges()

    reset(component.foo)
    fixture.detectChanges()

    expect(component.foo).toBe(0)
  })
})

describe('change detection', () => {
  @Component({
    selector: 'test-reactive',
    template: `{{foo}}`,
    changeDetection: ChangeDetectionStrategy.OnPush,
  })
  class ReactiveComponent {
    foo = state(0)

    constructor(private injector: Injector) {}

    ngOnInit() {
      init(this, this.injector)
    }

    ngOnDestroy() {
      deinit(this)
    }
  }

  @Component({
    template: `<test-reactive></test-reactive>`,
  })
  class TestComponent {}

  let component: TestComponent
  let fixture: ComponentFixture<TestComponent>

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ TestComponent, ReactiveComponent ]
    })
    .compileComponents()
  }))

  beforeEach(() => {
    fixture = TestBed.createComponent(TestComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should mark view dirty', () => {
    // tslint:disable-next-line:deprecation
    const reactive = fixture.debugElement.query(By.directive(ReactiveComponent)).injector.get(ReactiveComponent)
    reactive.foo = 2

    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toBe('2')
  })
})

# ng-reactive

Reactive utility for Angular, embraces binding from RxJS observable to component property.

## Install

```bash
npm install ng-reactive
```

## Usage

Eliminate async pipe and subscription process:

```typescript
import { bind, state, unbind, updateOn, viewUpdate, Reactive, StateChanges } from 'ng-reactive'
import { interval, of, Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { AccountService, User } from './account.service'
import { HeartbeatService } from './heartbeat.service'

@Component({
  template: `
    <!-- No async pipe in template -->
    <p>Inside reactive component</p>   
    <p id="greeting">Hello {{ username }}, it's {{ time | date:'medium' }} now.</p>
    <ng-container *ngIf="items.length > 0">
      <p>Items:</p>
      <ul>
        <li *ngFor="let item of items">{{ item }}</li>
      </ul>
    </ng-container>
  `,
})
class HelloComponent extends Reactive {
  // Define inputs as before
  @Input() id: string
  @Input() password: string

  // Define a set of reactive states with their default values
  username = state('Anonymous')
  items: string[] = state([])
  time = state(new Date())

  constructor(
    injector: Injector,
    private accountService: AccountService,
    private heartbeatService: HeartbeatService,
  ) {
    // Passing injector for automatic marking dirty
    super(injector)
  }

  // Implement update method based on changes and whether it's first run
  update(changes: StateChanges<this>, first: boolean) {
    // Execute only in first run
    if (first) {
      // Bind an RxJS observable to a reactive state
      bind(this.time, interval(1000).pipe(map(() => new Date())))
    }

    // Execute whenever the `id` or `password` input changes
    if (updateOn(changes.id, changes.password)) {
      if (this.id != null && this.password != null) {
        // Binding to a constant data
        bind(this.username, of('Loading...')

        const user$ = this.doLogin(this.id, this.password)
        // Previous subscription will be unsubscribed automatically
        bind(this.username, user$.pipe(map(x => x.name)))
        bind(this.items, user$.pipe(map(x => x.items)))
      } else {
        // Unbind a reactive state
        unbind(this.username)
        unbind(this.items)

        // Imperatively change a reactive state
        this.username = 'Anonymous'
        this.items = []
      }
    }

    // Execute whenever the `username` reactive state changes
    if (updateOn(changes.username)) {
      // Schedule an operation after view updated
      viewUpdate(() => {
        // Operation depends on DOM
        this.someViewOperation()
      })
    }

    // Execute whenever the `time` reactive state changes or in the first run
    // Both inputs and reactive states are tracked
    if (updateOn(changes.time) || first) {
      this.heartbeatService.send()
    }
  }

  // Example method for observable handling
  private doLogin(id: string, password: string): Observable<User> {
    return this.accountService.login(this.id, this.password)
  }

  // Example method for side effects
  private someViewOperation() {
    const $greeting = document.querySelector('#greeting')
    const result = $greeting.textContent.indexOf(this.username) > 0
    if (result) {
      console.log(`View operation done`)
    } else {
      console.warn(`View operation failed`)
    }
  }
}
```

Live example available at [StackBlitz](https://stackblitz.com/edit/angular-gtufmp?file=src%2Fapp%2Fhello.component.ts).

## Legacy Mode

If someone don't want or cannot use base class, then it can also be combined with plain Angular components:

```typescript
import { bind, state, unbind, updateOn, viewUpdate, Reactive, StateChanges } from 'ng-reactive'

@Component()
class HelloComponent {
  @Input() foo: string

  bar = state(0)
  baz = state(true)

  constructor(private injector: Injector) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes.foo) {
      // Use `bind()` or `unbind()` at any time
      bind(this.bar, this.makeUseOf(this.foo))
    }
  }

  ngOnInit() {
    // Remember to call `init()` in `OnInit` hook
    init(this, this.injector)

    bind(this.baz, someDataSource$)
  }

  ngOnDestroy() {
    // Remember to call `deinit()` in `OnDestroy` hook
    deinit(this)
  }

  private makeUseOf(foo: string): Observable<number> {
    // ...
  }
}
```

Note, `updateOn()` and `viewUpdate()` cannot be used without the base class.

## Cleanup

An observable is self-disposable, just make sure the finalization exists when making that data source.

```typescript
// Setup builtin cleanup logic
const dataSource = new Observable((observable) => {
  // ...
  return () => {
    additionalCleanupLogic()
  }
})

// Setup extra cleanup logic
const dataSource = someObservable.pipe(
  finalize(() => {
    additionalCleanupLogic()
  })
)
```

## Caveat

The `OnChanges` hook in Angular uses non-minified property name, and the `StateChanges` object bases on it.
When using Closure compiler advanced mode or other property-mangling tool, the input names need to be literal but reactive state names need to be identifier, like:

```typescript
update(changes: StateChanges<this>, first: boolean) {
  if (updateOn(changes['someInput'])) {
    // ...
  }

  if (updateOn(changes.someState)) {
    // ...
  }
}
```

Also need to make sure input name are not too short (which could conflict with other minified names).

Hopefully not much people are doing property mangling outside Google.

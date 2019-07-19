import { ChangeDetectionStrategy, Component } from '@angular/core'
import { bind, state, updateOn, Reactive, StateChanges } from 'ng-reactive'
import { interval, Observable } from 'rxjs'
import { map } from 'rxjs/operators'

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent extends Reactive {
  title = 'ng-reactive'

  count = state(0)

  update(changes: StateChanges<this>, first: boolean): void {
    if (first) {
      bind(this.count, this.makeHeartbeat())
    }

    if (updateOn(changes.count)) {
      console.log(`count changed to ${this.count}`)
    }
  }

  private makeHeartbeat(): Observable<number> {
    return interval(1000).pipe(map(x => x + 1))
  }
}

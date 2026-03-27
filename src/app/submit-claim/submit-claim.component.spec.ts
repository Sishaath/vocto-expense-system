import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubmitClaimComponent } from './submit-claim.component';

describe('SubmitClaimComponent', () => {
  let component: SubmitClaimComponent;
  let fixture: ComponentFixture<SubmitClaimComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubmitClaimComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SubmitClaimComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

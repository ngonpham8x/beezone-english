import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { appendParentContact } from '../src/modules/attendance/parentContact';

let db: PGlite;
const owner = '00000000-0000-4000-8000-000000000001';
const staff = '00000000-0000-4000-8000-000000000002';
const base = { settings: {}, programs: [], teachers: [], rooms: [], classes: [], students: [], timetableSlots: [], grades: [], receipts: [], backups: [], activityLogs: [], attendanceSessions: [] };
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;`);
  for (const filename of readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${filename}`, 'utf8'));
  await db.exec(`insert into auth.users(id,email) values ('${owner}','owner@example.test'),('${staff}','staff@example.test');
    update public.profiles set role='owner',is_active=true where id='${owner}';
    update public.profiles set is_active=true,permissions='{}' where id='${staff}';
    grant usage on schema public,auth to authenticated; grant select,insert,update on public.center_data to authenticated; grant select on public.profiles to authenticated;`);
}, 60_000);
beforeEach(async () => {
  await db.exec('reset role');
  await db.exec('delete from public.request_quotas');
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role','authenticated',false)", [owner]);
  await db.exec('delete from public.center_data');
  await db.query("insert into public.center_data(id,payload) values ('primary',$1::jsonb)", [JSON.stringify(base)]);
  await db.query("update public.profiles set permissions='{}',is_active=true where id=$1", [staff]);
});
afterAll(async () => { await db?.close(); });
async function asStaff(permissions: object = {}) {
  await db.query('update public.profiles set permissions=$1::jsonb where id=$2', [JSON.stringify(permissions), staff]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [staff]);
  await db.exec('set role authenticated');
}
describe('database migrations and permission enforcement', () => {
  it('allows explicit academic delegation and keeps unrelated permissions denied', async () => {
    await asStaff({ academic: { classes: true, rooms: true, programs: true }, student: { add: true }, teacher: { edit: true } });
    const payload = {
      ...base,
      programs: [{ id: 'p', name: 'Test program' }],
      rooms: [{ id: 'r', name: 'Test room' }],
      teachers: [{ id: 't', name: 'Test teacher', assignedClassIds: ['c'] }],
      classes: [{ id: 'c', teacherId: 't', roomId: 'r', programId: 'p', studentIds: ['s'] }],
      students: [{ id: 's', classId: 'c', programId: 'p', feeStatus: 'unpaid' }],
      timetableSlots: [{ id: 'slot', classId: 'c', teacherId: 't', roomId: 'r', dayOfWeek: 'Thứ 3', startTime: '18:00', endTime: '19:00' }],
      enrollments: [{ id: 'e', studentId: 's', classId: 'c', status: 'active', startDate: '2026-10-01' }],
      scheduleChanges: [{ id: 'extra', classId: 'c', kind: 'extra', date: '2026-10-02', startTime: '18:00', endTime: '19:00', reason: 'Test' }],
    };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    expect((await db.query<{ payload: typeof payload }>('select payload from public.center_data')).rows[0].payload).toEqual(payload);
    for (const patch of [{ settings: { name: 'Unauthorized' } }, { backups: [{ id: 'backup' }] }, { grades: [{ id: 'g', classId: 'c', studentId: 's' }] }, { students: [{ ...payload.students[0], name: 'Unauthorized edit' }] }]) {
      await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, ...patch })])).rejects.toThrow();
    }
  });
  it('keeps legacy, missing and non-boolean academic grants denied and scopes grants separately', async () => {
    for (const academic of [undefined, {}, { classes: 'true', rooms: 'true', programs: 'true' }]) {
      await db.exec('reset role');
      await asStaff({ student: { add: true, edit: true }, teacher: { edit: true }, academic });
      for (const patch of [{ rooms: [{ id: 'r' }] }, { programs: [{ id: 'p' }] }, { classes: [{ id: 'c', studentIds: [] }] }, { timetableSlots: [{ id: 'slot' }] }]) {
        await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, ...patch })])).rejects.toThrow();
      }
    }
    await db.exec('reset role');
    await asStaff({ academic: { rooms: true } });
    const withRoom = { ...base, rooms: [{ id: 'r', name: 'Room' }] };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(withRoom)]);
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...withRoom, rooms: [{ id: 'r', name: 'Renamed' }] })]);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...withRoom, programs: [{ id: 'p' }] })])).rejects.toThrow(/Owner permission/);
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(base)]);
  });
  it('prevents delegated removal of classes, rooms and programs with linked history', async () => {
    const payload = { ...base, programs: [{ id: 'p' }], rooms: [{ id: 'r' }], classes: [{ id: 'c', programId: 'p', roomId: 'r', studentIds: [] }], attendanceSessions: [{ id: 'a', classId: 'c', date: '2020-01-01', entries: [] }] };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    await asStaff({ academic: { programs: true, rooms: true, classes: true } });
    for (const patch of [{ classes: [] }, { rooms: [] }, { programs: [] }]) {
      await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, ...patch })])).rejects.toThrow(/must be preserved/);
    }
    expect((await db.query<{ payload: typeof payload }>('select payload from public.center_data')).rows[0].payload).toEqual(payload);
  });
  const sessionPayload = (billed=true) => ({...base,sessionBillingVersion:1,classes:[{id:'a',teacherId:'t',studentIds:['s'],billingMode:'session',sessionRate:150000,sessionBillingStartDate:'2020-01-01',sessionAbsencePolicy:'attended'}],students:[{id:'s',classId:'a',status:'active',feeStatus:billed?'debt':'unpaid'}],attendanceSessions:billed?[{id:'att',classId:'a',date:'2020-01-02',billing:{unitPrice:150000,absencePolicy:'attended'},entries:[{studentId:'s',status:'present'}]}]:[]});
  const sessionReceipt = {id:'r',studentId:'s',classId:'a',paymentKind:'session',courseFee:0,monthlyFee:0,sessionFee:150000,sessionLines:[{attendanceSessionId:'att',date:'2020-01-02',unitPrice:150000}],discount:0,paidAmount:50000,debtAmount:100000,paymentDate:'2020-01-10'};
  it('includes unbilled lessons in student debt when a teacher saves attendance',async()=>{
    await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(sessionPayload(false))]);
    await asStaff({teacher:{edit:true},teacherId:'t'});
    await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(sessionPayload())]);
    await expect(db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify({...sessionPayload(),students:[{...sessionPayload().students[0],feeStatus:'unpaid'}]})])).rejects.toThrow(/derived fee status/);
  });
  it('charges no fee for either kind of absence under the center policy',async()=>{
    await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(sessionPayload())]);
    await asStaff({teacher:{edit:true},teacherId:'t'});
    for(const status of ['absent','excused','late']){
      const data=sessionPayload();data.attendanceSessions[0].entries[0].status=status;data.students[0].feeStatus=status==='late'?'debt':'unpaid';
      await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(data)]);
    }
  });
  it('keeps historical price immutable while the owner changes future class rates',async()=>{
    await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(sessionPayload())]);
    const data=sessionPayload();data.classes[0].sessionRate=200000;
    await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(data)]);
    data.attendanceSessions[0].billing.unitPrice=200000;
    await expect(db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(data)])).rejects.toThrow(/price is immutable/);
  });
  it('rejects forged teacher prices and charging students outside the date roster',async()=>{
    const data=sessionPayload(false); await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(data)]);
    await asStaff({teacher:{edit:true},teacherId:'t'});
    const forged=sessionPayload();forged.attendanceSessions[0].billing.unitPrice=1;
    await expect(db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(forged)])).rejects.toThrow(/configuration/);
    await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    const withOther={...data,students:[...data.students,{id:'other',classId:'b',status:'active',feeStatus:'unpaid'}],classes:[...data.classes,{id:'b',teacherId:'other',studentIds:['other'],billingMode:'course',sessionRate:150000,sessionBillingStartDate:'2020-01-01',sessionAbsencePolicy:'attended'}]};
    await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(withOther)]);
    await asStaff({teacher:{edit:true},teacherId:'t'});
    const invalid={...withOther,attendanceSessions:sessionPayload().attendanceSessions}; invalid.attendanceSessions[0].entries[0].studentId='other';
    await expect(db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(invalid)])).rejects.toThrow(/not enrolled/);
  });
  it('allows a collector to invoice recorded lessons and rejects double billing',async()=>{
    const data=sessionPayload();await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(data)]);
    await asStaff({tuition:{collect:true}});
    const collected={...data,receipts:[sessionReceipt],students:[{...data.students[0],feeStatus:'partial'}]};
    await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(collected)]);
    await expect(db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify({...collected,receipts:[sessionReceipt,{...sessionReceipt,id:'r2'}]})])).rejects.toThrow(/already billed/);
  });
  it('prevents removing or changing the charged part of attendance referenced by a receipt',async()=>{
    const data={...sessionPayload(),receipts:[sessionReceipt]};await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(data)]);
    await expect(db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify({...data,attendanceSessions:[]})])).rejects.toThrow(/receipt reference/);
    data.attendanceSessions[0].entries[0].status='excused';
    await expect(db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(data)])).rejects.toThrow(/receipt reference/);
    data.attendanceSessions[0].entries[0].status='late';
    await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(data)]);
  });
  it('validates session invoice arithmetic and payment history at the database',async()=>{
    const data=sessionPayload();
    for(const receipt of [{...sessionReceipt,debtAmount:1},{...sessionReceipt,paidAmount:50000.5,debtAmount:99999.5},{...sessionReceipt,installments:[{date:'2020-01-10',amount:60000}]}]){
      await expect(db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify({...data,receipts:[receipt]})])).rejects.toThrow(/amount/);
    }
  });
  it('requires an owner to enable billing on legacy attendance',async()=>{
    const data=sessionPayload();delete (data.attendanceSessions[0] as any).billing;data.students[0].feeStatus='unpaid';
    await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(data)]);
    await asStaff({teacher:{edit:true},teacherId:'t'});
    await expect(db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(sessionPayload())])).rejects.toThrow(/Only owner/);
  });
  it('rejects old clients that drop billing version and future billable attendance',async()=>{
    const data=sessionPayload();await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(data)]);
    const oldClient={...data};delete (oldClient as any).sessionBillingVersion;
    await expect(db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(oldClient)])).rejects.toThrow(/Client update required/);
    const future=sessionPayload();future.attendanceSessions[0].id='future';future.attendanceSessions[0].date='2099-01-01';
    await expect(db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(future)])).rejects.toThrow(/future attendance/);
  });
  it('rejects writes from an old client that would discard new operations arrays', async () => {
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, enrollments: [], scheduleChanges: [] })]);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(base)])).rejects.toThrow(/Client update required/);
  });
  it('validates course dates, positive integral lesson counts and payment due dates at the database', async () => {
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, classes: [{ id: 'a', startDate: '2026-10-13', endDate: '2026-10-12' }] })])).rejects.toThrow(/Course dates reversed/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, classes: [{ id: 'a', totalSessions: 1.5 }] })])).rejects.toThrow(/Invalid total sessions/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, receipts: [{ id: 'r', courseFee: 10, discount: 0, paidAmount: 0, debtAmount: 10, dueDate: '2026-02-30' }] })])).rejects.toThrow();
  });
  it('denies staff schedule exceptions independently of the UI', async () => {
    const payload = { ...base, classes: [{ id: 'a', teacherId: 't', studentIds: [] }] };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    await asStaff({ student: { edit: true }, teacher: { edit: true } });
    const change = { id: 'change', kind: 'extra', classId: 'a', date: '2026-10-13', startTime: '18:00', endTime: '19:00', reason: 'Makeup' };
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, scheduleChanges: [change] })])).rejects.toThrow(/Owner permission required: scheduleChanges/);
  });
  it('permits enrollment history for a student editor and denies a viewer', async () => {
    const payload = { ...base, students: [{ id: 's', classId: 'a', feeStatus: 'unpaid' }], classes: [{ id: 'a', teacherId: 't', studentIds: ['s'] }] };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    const history = { ...payload, enrollments: [{ id: 'e', studentId: 's', classId: 'a', status: 'active', startDate: '2026-10-13' }] };
    await asStaff({ student: { view: true } });
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(history)])).rejects.toThrow(/creation denied/);
    await db.exec('reset role'); await asStaff({ student: { edit: true } });
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(history)]);
    expect((await db.query<{ payload: typeof history }>('select payload from public.center_data')).rows[0].payload.enrollments[0].classId).toBe('a');
  });
  it('denies an unauthorized settings write at the database', async () => {
    await asStaff();
    await expect(db.query("update public.center_data set payload=$1::jsonb where id='primary'", [JSON.stringify({ ...base, settings: { name: 'Injected' } })])).rejects.toThrow(/Owner permission/);
  });
  it('allows login activity without permitting business changes', async () => {
    await asStaff();
    const payload = { ...base, activityLogs: [{ id: 'login', action: 'ĐĂNG NHẬP' }] };
    await db.query("update public.center_data set payload=$1::jsonb where id='primary'", [JSON.stringify(payload)]);
    expect((await db.query<{ payload: typeof payload }>('select payload from public.center_data')).rows[0].payload.activityLogs).toEqual(payload.activityLogs);
  });
  it('denies student creation to a user with view-only access', async () => {
    await asStaff({ student: { view: true } });
    await expect(db.query("update public.center_data set payload=$1::jsonb", [JSON.stringify({ ...base, students: [{ id: 's1' }] })])).rejects.toThrow(/creation denied/);
  });
  it('uses a revision comparison to reject a stale update', async () => {
    const { rows } = await db.query<{ updated_at: string }>('select updated_at::text from public.center_data');
    await db.exec("update public.center_data set payload=jsonb_set(payload,'{activityLogs}','[{\"id\":\"other\"}]')");
    const updated = await db.query('update public.center_data set payload=$1::jsonb where updated_at=$2::timestamptz returning id', [JSON.stringify(base), rows[0].updated_at]);
    expect(updated.rows).toHaveLength(0);
  });
  it('rejects malformed IDs and negative receipt amounts even for an owner', async () => {
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, students: [{ id: 's' }, { id: 's' }] })])).rejects.toThrow(/Duplicate/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, receipts: [{ id: 'r', courseFee: 100, discount: 0, paidAmount: -1, debtAmount: 100 }] })])).rejects.toThrow(/Invalid receipt/);
  });
  it('allows assigned attendance edits and rejects another class', async () => {
    const classes = [{ id: 'a', teacherId: 't', studentIds: [] }, { id: 'b', teacherId: 'other', studentIds: [] }];
    const payload = { ...base, classes };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    await asStaff({ teacher: { edit: true }, teacherId: 't' });
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, attendanceSessions: [{ id: 'att', classId: 'a' }] })]);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, attendanceSessions: [{ id: 'att', classId: 'b' }] })])).rejects.toThrow(/Attendance permission/);
  });
  it('blocks inactive accounts using RLS', async () => {
    await db.query('update public.profiles set is_active=false where id=$1', [staff]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [staff]);
    await db.exec('set role authenticated');
    expect((await db.query('select * from public.center_data')).rows).toHaveLength(0);
  });
  it('enforces class-scoped attendance permission for parent contact notes on the server', async () => {
    const classes = [{ id: 'a', teacherId: 't', studentIds: ['s'] }, { id: 'b', teacherId: 'other', studentIds: ['s2'] }];
    const payload = { ...base, classes, students: [{ id: 's', classId: 'a', feeStatus: 'unpaid' }, { id: 's2', classId: 'b', feeStatus: 'unpaid' }], attendanceSessions: [
      { id: 'att-a', classId: 'a', date: '2020-01-02', entries: [{ studentId: 's', status: 'absent', note: '' }] },
      { id: 'att-b', classId: 'b', date: '2020-01-02', entries: [{ studentId: 's2', status: 'absent', note: '' }] },
    ] };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    await asStaff({ teacher: { edit: true }, teacherId: 't' });
    const allowed = structuredClone(payload);
    allowed.attendanceSessions[0].entries[0].note = appendParentContact('', 'Zalo', 'Parent contacted', 'Test teacher', new Date('2020-01-02T12:00:00Z'));
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(allowed)]);
    const forbidden = structuredClone(allowed);
    forbidden.attendanceSessions[1].entries[0].note = allowed.attendanceSessions[0].entries[0].note;
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(forbidden)])).rejects.toThrow(/Attendance permission/);
    await db.exec('reset role');
    await asStaff({ teacher: { view: true }, assignedClassIds: ['a'] });
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)])).rejects.toThrow(/Attendance permission/);
    expect((await db.query<{ payload: typeof allowed }>('select payload from public.center_data')).rows[0].payload.attendanceSessions[0].entries[0].note).toBe(allowed.attendanceSessions[0].entries[0].note);
  });
  it('prevents demoting or deleting the final active owner', async () => {
    await expect(db.query("update public.profiles set role='staff' where id=$1", [owner])).rejects.toThrow(/final owner/);
    await expect(db.query('delete from public.profiles where id=$1', [owner])).rejects.toThrow(/final owner/);
  });
});

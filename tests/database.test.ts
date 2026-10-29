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
  await db.exec('delete from public.bz_work_handoffs; delete from public.bz_work_events; delete from public.bz_work_notes; delete from public.bz_work_reasons; delete from public.bz_work_tasks; delete from public.bz_work_people');
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role','authenticated',false)", [owner]);
  await db.exec('delete from public.center_data');
  await db.query("insert into public.center_data(id,payload) values ('primary',$1::jsonb)", [JSON.stringify(base)]);
  await db.query("update public.profiles set role='teacher',permissions='{}',is_active=true where id=$1", [staff]);
});
afterAll(async () => { await db?.close(); });
async function asStaff(permissions: object = {}, role: 'admin' | 'trainer' | 'teacher' = 'admin') {
  await db.query('update public.profiles set permissions=$1::jsonb,role=$2 where id=$3', [JSON.stringify(permissions), role, staff]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [staff]);
  await db.exec('set role authenticated');
}
describe('database migrations and permission enforcement', () => {
  it('restores center data and every work-history table atomically for an active owner', async () => {
    const taskId = '10000000-0000-4000-8000-000000000010';
    const work = {
      people: [],
      tasks: [{
        id: taskId, branch: 'training', title: 'Restored task', description: 'Full content',
        assigned_uid: staff, created_by: owner, work_date: '2026-10-26', priority: 'high', status: 'progress',
      }],
      notes: [{ id: '20000000-0000-4000-8000-000000000010', task_id: taskId, author_uid: owner, body: 'Restored note' }],
      reasons: [{ id: '30000000-0000-4000-8000-000000000010', task_id: taskId, author_uid: owner, kind: 'progress', body: 'Restored reason' }],
      handoffs: [{ id: '40000000-0000-4000-8000-000000000010', task_id: taskId, from_uid: owner, to_uid: staff, note: 'Restored handoff' }],
      events: [{ id: 9, task_id: taskId, actor_uid: owner, action: 'restored', payload: { source: 'backup' } }],
    };
    await db.exec('set role authenticated');
    expect((await db.query('select role from public.bz_work_sync_people() where user_id=$1', [owner])).rows).toEqual([{ role: 'manager' }]);
    await db.query('select public.bz_restore_full_backup($1::jsonb,$2::jsonb)', [
      JSON.stringify({ ...base, settings: { name: 'Restored BeeZone' } }),
      JSON.stringify(work),
    ]);

    expect((await db.query("select payload->'settings'->>'name' as name from public.center_data where id='primary'")).rows).toEqual([{ name: 'Restored BeeZone' }]);
    expect((await db.query('select title from public.bz_work_tasks')).rows).toEqual([{ title: 'Restored task' }]);
    expect((await db.query('select body from public.bz_work_notes')).rows).toEqual([{ body: 'Restored note' }]);
    expect((await db.query('select body from public.bz_work_reasons')).rows).toEqual([{ body: 'Restored reason' }]);
    expect((await db.query('select note from public.bz_work_handoffs')).rows).toEqual([{ note: 'Restored handoff' }]);
    expect((await db.query('select action from public.bz_work_events')).rows).toEqual([{ action: 'restored' }]);
  });
  it('rejects full backup restore from a non-owner account', async () => {
    await asStaff({});
    await expect(db.query('select public.bz_restore_full_backup($1::jsonb,$2::jsonb)', [
      JSON.stringify(base),
      JSON.stringify({ people: [], tasks: [], notes: [], reasons: [], handoffs: [], events: [] }),
    ])).rejects.toThrow(/Only an active owner/);
  });
  it('lets an active Hành chính profile read all teacher/training work even when the work projection is stale', async () => {
    const taskId = '10000000-0000-4000-8000-000000000001';
    await db.query("update public.profiles set role='admin' where id=$1", [staff]);
    await db.query(
      `insert into public.bz_work_people(user_id,display_name,email,role,active) values
       ($1,'Owner','owner@example.test','manager',true),
       ($2,'Office','staff@example.test','teacher',true)`,
      [owner, staff],
    );
    await db.query(
      `insert into public.bz_work_tasks(id,branch,title,assigned_uid,created_by,work_date)
       values ($1,'training','Teacher update',$2,$2,'2026-10-26')`,
      [taskId, owner],
    );
    await db.query(
      "insert into public.bz_work_notes(task_id,author_uid,body) values ($1,$2,'Teacher note')",
      [taskId, owner],
    );
    await db.query(
      "insert into public.bz_work_reasons(task_id,author_uid,kind,body) values ($1,$2,'progress','Training update')",
      [taskId, owner],
    );
    await db.query(
      "insert into public.bz_work_handoffs(task_id,from_uid,to_uid,note) values ($1,$2,$3,'Shift handoff')",
      [taskId, owner, staff],
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [staff]);
    await db.exec('set role authenticated');

    expect((await db.query('select title from public.bz_work_tasks')).rows).toEqual([{ title: 'Teacher update' }]);
    expect((await db.query('select body from public.bz_work_notes')).rows).toEqual([{ body: 'Teacher note' }]);
    expect((await db.query('select body from public.bz_work_reasons')).rows).toEqual([{ body: 'Training update' }]);
    expect((await db.query('select note from public.bz_work_handoffs')).rows).toEqual([{ note: 'Shift handoff' }]);
  });
  it('applies one consistent RLS rule to native teacher tasks and their history', async () => {
    const taskId = '10000000-0000-4000-8000-000000000020';
    expect((await db.query<{ policyname: string }>(
      "select policyname from pg_policies where schemaname='public' and tablename='bz_work_tasks' order by policyname",
    )).rows).toEqual([{ policyname: 'bz_work_tasks_read' }]);
    await db.query("update public.profiles set role='trainer' where id=$1", [staff]);
    await db.query(
      `insert into public.bz_work_people(user_id,display_name,email,role,active) values
       ($1,'Owner','owner@example.test','manager',true),
       ($2,'Training','staff@example.test','trainer',true)`,
      [owner, staff],
    );
    await db.query(
      `insert into public.bz_work_tasks(id,branch,title,assigned_uid,created_by,work_date)
       values ($1,'teacher','Teacher-only task',$2,$3,'2026-10-27')`,
      [taskId, staff, owner],
    );
    await db.query("insert into public.bz_work_notes(task_id,author_uid,body) values ($1,$2,'Teacher history')", [taskId, owner]);

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [staff]);
    await db.exec('set role authenticated');
    expect((await db.query('select title from public.bz_work_tasks')).rows).toEqual([{ title: 'Teacher-only task' }]);
    expect((await db.query('select body from public.bz_work_notes')).rows).toEqual([{ body: 'Teacher history' }]);

    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.query("update public.profiles set role='teacher' where id=$1", [staff]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [staff]);
    await db.exec('set role authenticated');
    expect((await db.query('select body from public.bz_work_notes')).rows).toEqual([{ body: 'Teacher history' }]);
  });
  it('lets student viewers edit only an existing grade comment and gives training/admin ranks centre-wide class scope', async () => {
    const grade = { id: 'g1', studentId: 's1', classId: 'c1', listening: 8, speaking: 8, reading: 8, writing: 8, midterm: 8, finalExam: 8, attendance: 8, average: 8, comment: 'Nhận xét cũ' };
    const payload = {
      ...base,
      classes: [{ id: 'c1', teacherId: 'teacher-1', studentIds: ['s1'] }],
      students: [{ id: 's1', classId: 'c1', status: 'active', feeStatus: 'unpaid' }],
      grades: [grade],
    };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);

    await asStaff({ student: { view: true } });
    const withComment = { ...payload, grades: [{ ...grade, comment: 'Nhận xét đã cập nhật' }] };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(withComment)]);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...withComment, grades: [{ ...withComment.grades[0], listening: 9 }] })])).rejects.toThrow(/denied/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...withComment, grades: [{ ...withComment.grades[0], comment: 'x'.repeat(2001) }] })])).rejects.toThrow(/Invalid grade comment/);

    await db.exec('reset role');
    await asStaff({ grade: { edit: true } }, 'trainer');
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...withComment, grades: [{ ...withComment.grades[0], listening: 9 }] })]);
  });
  it.each(['programs', 'rooms', 'classes', 'teachers'] as const)('enforces separate add/edit/delete grants for %s and respects explicit revocation of legacy grants', async (scope) => {
    const entity = { id: 'new', name: 'Independent record', ...(scope === 'classes' ? { studentIds: [] } : scope === 'teachers' ? { assignedClassIds: [] } : {}) };
    const payload = { ...base, [scope]: [entity] };
    const permissions = scope === 'teachers' ? { teacher: { add: true, edit: false, delete: false } }
      : { academic: { [scope]: true, [`${scope}Add`]: true, [`${scope}Edit`]: false, [`${scope}Delete`]: false } };
    await asStaff(permissions);
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, [scope]: [{ ...entity, name: 'Denied edit' }] })])).rejects.toThrow(/denied/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(base)])).rejects.toThrow(/denied/);
    await db.exec('reset role');
    await asStaff(scope === 'teachers' ? { teacher: { add: false, edit: true, delete: true } } : { academic: { [`${scope}Edit`]: true, [`${scope}Delete`]: true } });
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, [scope]: [{ ...entity, name: 'Allowed edit' }] })]);
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(base)]);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)])).rejects.toThrow(/denied/);
  });
  it('supports delegated multi-class registration and rejects stale clients, invalid references and forged rosters', async () => {
    const classes = ['c1', 'c2', 'c3'].map(id => ({ id, studentIds: id === 'c1' ? ['s'] : [] }));
    const student = { id: 's', classId: 'c1', status: 'active', feeStatus: 'unpaid' };
    const original = { ...base, classes, students: [student], enrollments: [] };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(original)]);
    const next = { ...original, classes: classes.map(c => ({ ...c, studentIds: ['s'] })), students: [{ ...student, additionalClassIds: ['c2', 'c3'] }], enrollments: ['c1', 'c2', 'c3'].map(id => ({ id: 'e-' + id, studentId: 's', classId: id, status: 'active' })) };
    await asStaff({ student: { edit: true } });
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(next)]);
    for (const extras of [['c1'], ['missing'], ['c2', 'c2'], null, 'c2']) {
      await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...next, students: [{ ...student, additionalClassIds: extras }] })])).rejects.toThrow();
    }
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...next, students: [student] })])).rejects.toThrow(/Client update required/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...next, classes })])).rejects.toThrow(/roster/);
    await asStaff({ student: { view: true } });
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...next, students: [{ ...student, additionalClassIds: ['c2'] }], classes: next.classes.map(c => c.id === 'c3' ? { ...c, studentIds: [] } : c) })])).rejects.toThrow(/denied/);
  });
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
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...withRoom, programs: [{ id: 'p' }] })])).rejects.toThrow(/Owner permission|denied/);
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
  it('allows priced attendance for an additional class but retains assigned-class enforcement', async () => {
    const legacy = sessionPayload(false);
    const payload = { ...legacy, classes: [...legacy.classes, { id: 'primary', teacherId: 'other', studentIds: ['s'] }], students: [{ ...legacy.students[0], classId: 'primary', additionalClassIds: ['a'] }] };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    await asStaff({ student: { edit: true }, assignedClassIds: ['a'] }, 'teacher');
    const next = { ...payload, students: [{ ...payload.students[0], feeStatus: 'debt' }], attendanceSessions: sessionPayload(true).attendanceSessions };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(next)]);
    await db.exec('reset role');
    await asStaff({ student: { edit: true }, assignedClassIds: ['primary'] }, 'teacher');
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...next, attendanceSessions: next.attendanceSessions.map(session => ({ ...session, lessonTopic: 'Denied' })) })])).rejects.toThrow(/Attendance permission denied/);
  });
  const sessionReceipt = {id:'r',studentId:'s',classId:'a',paymentKind:'session',courseFee:0,monthlyFee:0,sessionFee:150000,sessionLines:[{attendanceSessionId:'att',date:'2020-01-02',unitPrice:150000}],discount:0,paidAmount:50000,debtAmount:100000,paymentDate:'2020-01-10'};
  it('includes unbilled lessons in student debt when a teacher saves attendance',async()=>{
    await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(sessionPayload(false))]);
    await asStaff({teacher:{edit:true},teacherId:'t'}, 'teacher');
    await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(sessionPayload())]);
    await expect(db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify({...sessionPayload(),students:[{...sessionPayload().students[0],feeStatus:'unpaid'}]})])).rejects.toThrow(/derived fee status/);
  });
  it('charges no fee for either kind of absence under the center policy',async()=>{
    await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(sessionPayload())]);
    await asStaff({teacher:{edit:true},teacherId:'t'}, 'teacher');
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
    await asStaff({teacher:{edit:true},teacherId:'t'}, 'teacher');
    const forged=sessionPayload();forged.attendanceSessions[0].billing.unitPrice=1;
    await expect(db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(forged)])).rejects.toThrow(/configuration/);
    await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    const withOther={...data,students:[...data.students,{id:'other',classId:'b',status:'active',feeStatus:'unpaid'}],classes:[...data.classes,{id:'b',teacherId:'other',studentIds:['other'],billingMode:'course',sessionRate:150000,sessionBillingStartDate:'2020-01-01',sessionAbsencePolicy:'attended'}]};
    await db.query('update public.center_data set payload=$1::jsonb',[JSON.stringify(withOther)]);
    await asStaff({teacher:{edit:true},teacherId:'t'}, 'teacher');
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
    await asStaff({teacher:{edit:true},teacherId:'t'}, 'teacher');
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
  it('validates semester grades and rejects duplicate student-class-semester rows', async () => {
    const grade = {
      id: 'grade-gki', studentId: 's', classId: 'a', semester: 'GKI',
      listening: 8, speaking: 9, readingWriting: 7, reading: 7, writing: 7,
      midterm: 0, finalExam: 0, attendance: 0, average: 8,
      unitScores: { unit1: 9 }, comment: 'Tiến bộ tốt',
    };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, grades: [grade] })]);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, grades: [{ ...grade, semester: 'HK3' }] })])).rejects.toThrow(/semester/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, grades: [{ ...grade, unitScores: { unit1: 11 } }] })])).rejects.toThrow(/unit score/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, grades: [grade, { ...grade, id: 'grade-duplicate' }] })])).rejects.toThrow(/Duplicate grade/);
  });
  it('stores partially entered grades and validates every score that is present', async () => {
    const grade = {
      id: 'grade-partial', studentId: 's', classId: 'a', semester: 'GKI',
      listening: 7.5, average: 7.5,
    };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, grades: [grade] })]);
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, grades: [{ ...grade, speaking: 8 }] })]);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, grades: [{ ...grade, speaking: '8' }] })])).rejects.toThrow(/Grade score/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...base, grades: [{ ...grade, listening: 11 }] })])).rejects.toThrow(/Grade score/);
  });
  it('validates program-scoped grade column kinds and permits archived-name reuse', async () => {
    const programPayload = { ...base, programs: [{ id: 'program-1' }] };
    const active = { id: 'unit-active', name: 'UNIT 13', semester: 'GKI', programId: 'program-1', kind: 'unit' };
    const archived = { ...active, id: 'unit-archived', archivedAt: '2026-10-28T03:00:00.000Z' };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...programPayload, settings: { gradeColumns: [active, archived] } })]);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...programPayload, settings: { gradeColumns: [{ ...active, kind: 'unknown' }] } })])).rejects.toThrow(/Invalid grade column/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...programPayload, settings: { gradeColumns: [{ ...active, programId: 'missing' }] } })])).rejects.toThrow(/program does not exist/);
  });
  it('denies staff schedule exceptions independently of the UI', async () => {
    const payload = { ...base, classes: [{ id: 'a', teacherId: 't', studentIds: [] }] };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    await asStaff({ student: { edit: true }, teacher: { edit: true } });
    const change = { id: 'change', kind: 'extra', classId: 'a', date: '2026-10-13', startTime: '18:00', endTime: '19:00', reason: 'Makeup' };
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, scheduleChanges: [change] })])).rejects.toThrow(/Entity creation denied: schedule/);
  });
  it('stores teacher leave and substitution with matching original lessons and academic grants', async () => {
    const payload = {
      ...base,
      teachers: [
        { id: 't', name: 'Main teacher', assignedClassIds: ['a'] },
        { id: 'sub', name: 'Substitute', assignedClassIds: [] },
      ],
      rooms: [{ id: 'r', name: 'Room' }],
      classes: [{ id: 'a', teacherId: 't', roomId: 'r', studentIds: [] }],
      timetableSlots: [{ id: 'slot', classId: 'a', teacherId: 't', roomId: 'r', dayOfWeek: 'Thứ 3', startTime: '18:00', endTime: '19:00' }],
    };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    const change = { id: 'off', kind: 'teacher_off', classId: 'a', sourceSlotId: 'slot', date: '2026-10-13', startTime: '18:00', endTime: '19:00', teacherId: 't', roomId: 'r', substituteTeacherId: 'sub', reason: 'Leave' };
    await asStaff();
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, scheduleChanges: [change] })])).rejects.toThrow(/creation denied/);
    await db.exec('reset role');
    await asStaff({ academic: { classesAdd: true } });
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, scheduleChanges: [change] })]);
    await db.exec('reset role');
    await asStaff({ academic: { classesEdit: true } });
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, scheduleChanges: [{ ...change, reason: 'Approved leave' }] })]);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, scheduleChanges: [{ ...change, substituteTeacherId: 't' }] })])).rejects.toThrow(/Invalid substitute teacher/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, scheduleChanges: [{ ...change, teacherId: 'sub' }] })])).rejects.toThrow(/original lesson/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, scheduleChanges: [{ ...change, date: '2026-10-14' }] })])).rejects.toThrow(/original lesson/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, scheduleChanges: [{ ...change, substituteTeacherId: 'missing' }] })])).rejects.toThrow(/Invalid substitute teacher/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, scheduleChanges: [] })])).rejects.toThrow(/deletion denied/);
    await db.exec('reset role');
    await asStaff({ academic: { classesDelete: true } });
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({ ...payload, scheduleChanges: [] })]);
  });

  it('lets a substitute record only the approved class session without inheriting grades or other dates', async () => {
    const lessonDate = '2026-10-13';
    const payload = {
      ...base,
      teachers: [
        { id: 'main', name: 'Main teacher', email: 'main@example.test', assignedClassIds: ['a'] },
        { id: 'sub', name: 'Substitute teacher', email: 'staff@example.test', assignedClassIds: [] },
      ],
      rooms: [{ id: 'r', name: 'Room' }],
      classes: [{ id: 'a', teacherId: 'main', roomId: 'r', studentIds: ['student'] }],
      students: [{ id: 'student', classId: 'a', status: 'active', feeStatus: 'unpaid' }],
      timetableSlots: [{ id: 'slot', classId: 'a', teacherId: 'main', roomId: 'r', dayOfWeek: 'Thứ 3', startTime: '18:00', endTime: '19:00' }],
      scheduleChanges: [{
        id: 'off', kind: 'teacher_off', classId: 'a', sourceSlotId: 'slot', date: lessonDate,
        startTime: '18:00', endTime: '19:00', teacherId: 'main', roomId: 'r',
        substituteTeacherId: 'sub', reason: 'Approved leave',
      }],
    };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    await asStaff({
      student: { view: true, edit: true },
      teacher: { view: true, edit: false },
      grade: { view: true, edit: true },
      teacherId: 'sub',
      assignedClassIds: [],
    }, 'teacher');

    const approvedSession = {
      id: 'attendance-sub', classId: 'a', date: lessonDate, teacherId: 'sub',
      lessonTopic: 'Substitute lesson', entries: [],
    };
    const withAttendance = { ...payload, attendanceSessions: [approvedSession] };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(withAttendance)]);

    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({
      ...withAttendance,
      attendanceSessions: [{ ...approvedSession, teacherId: 'main' }],
    })])).rejects.toThrow(/Attendance permission denied/);

    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({
      ...withAttendance,
      attendanceSessions: [{ ...approvedSession, date: '2026-10-14' }],
    })])).rejects.toThrow(/Attendance permission denied/);

    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({
      ...withAttendance,
      grades: [{ id: 'grade-sub', studentId: 'student', classId: 'a', listening: 0, speaking: 0, reading: 0, writing: 0, midterm: 0, finalExam: 0, attendance: 0, average: 0 }],
    })])).rejects.toThrow(/Class grade permission denied/);
  });
  it('enforces the teacher role ceiling even when legacy permissions contain broad grants', async () => {
    const grade = {
      id: 'g', studentId: 's', classId: 'a', listening: 7, speaking: 7, reading: 7,
      writing: 7, midterm: 7, finalExam: 7, attendance: 7, average: 7,
    };
    const payload = {
      ...base,
      teachers: [{ id: 't', name: 'Teacher', email: 'staff@example.test', assignedClassIds: ['a'] }],
      rooms: [{ id: 'r', name: 'Room' }],
      classes: [{ id: 'a', teacherId: 't', roomId: 'r', studentIds: ['s'] }],
      students: [{ id: 's', name: 'Student', classId: 'a', status: 'active', feeStatus: 'unpaid' }],
      grades: [grade],
    };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    await asStaff({
      student: { view: true, add: true, edit: true, delete: true },
      teacher: { view: true, add: true, edit: true, delete: true },
      academic: { programs: true, classes: true, rooms: true },
      tuition: { view: true, collect: true, delete: true, showDebt: true },
      grade: { view: true, edit: true },
      teacherId: 't',
      assignedClassIds: ['a'],
    }, 'teacher');

    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({
      ...payload,
      students: [{ ...payload.students[0], name: 'Forbidden profile edit' }],
    })])).rejects.toThrow(/Teacher role cannot update: students/);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({
      ...payload,
      rooms: [{ ...payload.rooms[0], name: 'Forbidden room edit' }],
    })])).rejects.toThrow(/Teacher role cannot update: rooms/);

    const withGrade = { ...payload, grades: [{ ...grade, listening: 8, average: 7.1 }] };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(withGrade)]);
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({
      ...withGrade,
      attendanceSessions: [{ id: 'att', classId: 'a', teacherId: 't', date: '2026-10-27', entries: [] }],
    })]);
  });
  it('rejects a changed recurring slot whose teacher no longer matches the class assignment', async () => {
    const payload = {
      ...base,
      teachers: [
        { id: 'teacher-a', name: 'Teacher A', assignedClassIds: ['class-a'] },
        { id: 'teacher-b', name: 'Teacher B', assignedClassIds: [] },
      ],
      rooms: [{ id: 'room-a', name: 'Room A', status: 'available' }],
      classes: [{ id: 'class-a', teacherId: 'teacher-a', roomId: 'room-a', studentIds: [] }],
      timetableSlots: [{ id: 'slot-a', classId: 'class-a', teacherId: 'teacher-a', roomId: 'room-a', dayOfWeek: 'Thứ 2', startTime: '18:00', endTime: '19:30' }],
    };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    const reassigned = {
      ...payload,
      teachers: [
        { ...payload.teachers[0], assignedClassIds: [] },
        { ...payload.teachers[1], assignedClassIds: ['class-a'] },
      ],
      classes: [{ ...payload.classes[0], teacherId: 'teacher-b' }],
    };
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(reassigned)]))
      .rejects.toThrow(/Recurring timetable teacher must match class assignment/);
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({
      ...reassigned,
      timetableSlots: [{ ...payload.timetableSlots[0], teacherId: 'teacher-b' }],
    })]);
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
    await expect(db.query("update public.center_data set payload=$1::jsonb where id='primary'", [JSON.stringify({ ...base, settings: { name: 'Injected' } })])).rejects.toThrow(/Owner permission|denied/);
  });
  it('allows only delegated administrative or training accounts to change grade columns', async () => {
    const payload = { ...base, programs: [{ id: 'program-a', name: 'Program A' }] };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)]);
    const column = {
      id: 'progress-test',
      name: 'Progress Test',
      kind: 'assessment',
      semester: 'GKI',
      programId: 'program-a',
    };

    await asStaff({ grade: { edit: true } }, 'trainer');
    const withColumn = { ...payload, settings: { gradeColumns: [column] } };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(withColumn)]);

    await db.exec('reset role');
    await asStaff({ grade: { edit: true } }, 'admin');
    const withRenamedColumn = {
      ...withColumn,
      settings: { gradeColumns: [{ ...column, name: 'Progress Test Renamed' }] },
    };
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(withRenamedColumn)]);
    await expect(db.query('update public.center_data set payload=$1::jsonb', [
      JSON.stringify({ ...withRenamedColumn, settings: { ...withRenamedColumn.settings, name: 'Injected' } }),
    ])).rejects.toThrow(/Owner permission required: settings/);

    await db.exec('reset role');
    await asStaff({ grade: { edit: true } }, 'teacher');
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify({
      ...withRenamedColumn,
      settings: { gradeColumns: [...withRenamedColumn.settings.gradeColumns, { ...column, id: 'teacher-column', name: 'Teacher Column' }] },
    })])).rejects.toThrow(/Teacher role|Grade edit permission/);
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
    await asStaff({ teacher: { edit: true }, teacherId: 't' }, 'teacher');
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
    await asStaff({ teacher: { edit: true }, teacherId: 't' }, 'teacher');
    const allowed = structuredClone(payload);
    allowed.attendanceSessions[0].entries[0].note = appendParentContact('', 'Zalo', 'Parent contacted', 'Test teacher', new Date('2020-01-02T12:00:00Z'));
    await db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(allowed)]);
    const forbidden = structuredClone(allowed);
    forbidden.attendanceSessions[1].entries[0].note = allowed.attendanceSessions[0].entries[0].note;
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(forbidden)])).rejects.toThrow(/Attendance permission/);
    await db.exec('reset role');
    await asStaff({ teacher: { view: true }, assignedClassIds: ['a'] }, 'teacher');
    await expect(db.query('update public.center_data set payload=$1::jsonb', [JSON.stringify(payload)])).rejects.toThrow(/Attendance permission/);
    expect((await db.query<{ payload: typeof allowed }>('select payload from public.center_data')).rows[0].payload.attendanceSessions[0].entries[0].note).toBe(allowed.attendanceSessions[0].entries[0].note);
  });
  it('prevents demoting or deleting the final active owner', async () => {
    await expect(db.query("update public.profiles set role='staff' where id=$1", [owner])).rejects.toThrow(/final owner/);
    await expect(db.query('delete from public.profiles where id=$1', [owner])).rejects.toThrow(/final owner/);
  });
});

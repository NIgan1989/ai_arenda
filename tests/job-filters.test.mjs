import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './helpers/platform.mjs';
const {ownerJobTab,cleanerJobTab,ownerJobTabs,cleanerJobTabs,tabCounts,firstTab}=await load('job-filters');
test('the owner sees cleanings by what they wait for',()=>{
 assert.equal(ownerJobTab({status:'open'}),'need');
 for(const status of ['assigned','in_progress','submitted'])assert.equal(ownerJobTab({status,assigned_to:'c'}),'work');
 assert.equal(ownerJobTab({status:'completed',owner_id:'o',assigned_to:'c',fee:5000,settlement_paid:0}),'work');
 assert.equal(ownerJobTab({status:'completed',owner_id:'o',assigned_to:'c',fee:5000,settlement_paid:5000}),'done');
 // Cleaned by the owner's own staff: nothing to pay.
 assert.equal(ownerJobTab({status:'completed',owner_id:'o',assigned_to:'o',fee:5000}),'done');
 assert.equal(ownerJobTab({status:'cancelled',cancel_fee:1500,settlement_paid:0}),'work');
 assert.equal(ownerJobTab({status:'cancelled'}),'done');
});
test('the performer sees what is ahead, done and cancelled',()=>{
 assert.equal(cleanerJobTab({status:'assigned',assigned_to:'c'},'c'),'ahead');
 assert.equal(cleanerJobTab({status:'submitted',assigned_to:'c'},'c'),'ahead');
 assert.equal(cleanerJobTab({status:'completed',assigned_to:'c'},'c'),'done');
 assert.equal(cleanerJobTab({status:'cancelled',assigned_to:'c'},'c'),'cancelled');
 assert.equal(cleanerJobTab({status:'open'},'c',{status:'pending'}),'ahead');
 assert.equal(cleanerJobTab({status:'open'},'c',{status:'rejected'}),'cancelled');
 assert.equal(cleanerJobTab({status:'assigned',assigned_to:'x'},'c',{status:'pending'}),'cancelled');
});
test('tabs count their items and open on the first that has any',()=>{
 const counts=tabCounts(ownerJobTabs,[{status:'assigned',assigned_to:'c'},{status:'cancelled'}],ownerJobTab);
 assert.deepEqual(counts,{need:0,work:1,done:1});
 assert.equal(firstTab(ownerJobTabs,counts),'work');
 assert.equal(firstTab(cleanerJobTabs,{ahead:0,done:0,cancelled:0}),'ahead');
 assert.deepEqual(cleanerJobTabs.map(t=>t.label),['Предстоящие','Выполненные','Отменённые']);
});

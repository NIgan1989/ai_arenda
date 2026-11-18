import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './helpers/platform.mjs';
const {bookingTab,bookingTabCounts,firstBookingTab,bookingTabs}=await load('booking-filters');
test('bookings fall into active, finished and cancelled tabs',()=>{
 assert.deepEqual(bookingTabs.map(t=>t.label),['Активные','Завершённые','Отменённые']);
 assert.equal(bookingTab({status:'requested'},'guest','g'),'active');
 assert.equal(bookingTab({status:'confirmed'},'guest','g'),'active');
 assert.equal(bookingTab({status:'completed'},'guest','g'),'done');
 for(const status of ['cancelled','expired','rejected'])assert.equal(bookingTab({status},'guest','g'),'cancelled');
});
test('the owner keeps a booking active while money is still owed to the guest',()=>{
 assert.equal(bookingTab({status:'cancelled',owner_id:'o',terms:{paid_amount:5000}},'owner','o'),'active');
 assert.equal(bookingTab({status:'cancelled',owner_id:'o',terms:{paid_amount:5000,refund_recorded_at:1}},'owner','o'),'cancelled');
 assert.equal(bookingTab({status:'completed',owner_id:'o',terms:{deposit_status:'owner_verified',deposit_balance:10000}},'owner','o'),'active');
 assert.equal(bookingTab({status:'completed',owner_id:'o',terms:{deposit_status:'owner_verified',deposit_balance:0}},'owner','o'),'done');
 // The guest sees the same booking among the cancelled ones: there is nothing for them to do.
 assert.equal(bookingTab({status:'cancelled',owner_id:'o',terms:{paid_amount:5000}},'guest','g'),'cancelled');
});
test('the first tab is the active one, or the first that has bookings',()=>{
 const items=[{status:'cancelled'},{status:'cancelled'},{status:'completed'}];
 assert.deepEqual(bookingTabCounts(items,'guest','g'),{active:0,done:1,cancelled:2});
 assert.equal(firstBookingTab(bookingTabCounts(items,'guest','g')),'done');
 assert.equal(firstBookingTab({active:1,done:0,cancelled:0}),'active');
 assert.equal(firstBookingTab({active:0,done:0,cancelled:3}),'cancelled');
});

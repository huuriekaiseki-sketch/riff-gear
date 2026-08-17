-- supabase/migrations/0008_payment.sql
alter table orders
  add column payment_method text not null default 'card'
    check (payment_method in ('card', 'bank_transfer', 'cod')),
  add column payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid'));

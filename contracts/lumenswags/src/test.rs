#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_escrow_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let token = Address::generate(&env);

    let contract_id = env.register(Lumenswags, ());
    let client = LumenswagsClient::new(&env, &contract_id);

    client.create(&buyer, &seller, &1000, &token);

    assert_eq!(client.get_buyer(), buyer);
    assert_eq!(client.get_seller(), seller);
    assert_eq!(client.get_amount(), 1000);
    assert_eq!(client.get_token(), token);
    assert_eq!(client.get_state(), EscrowState::Created);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn test_create_rejects_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let token = Address::generate(&env);
    let contract_id = env.register(Lumenswags, ());
    let client = LumenswagsClient::new(&env, &contract_id);

    client.create(&buyer, &seller, &0, &token);
}

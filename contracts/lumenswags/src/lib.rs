#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token::TokenClient, Address, Env, MuxedAddress,
    String, Symbol,
};

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EscrowState {
    Created = 0,  // Escrow created, not yet funded
    Funded = 1,   // Buyer has deposited funds
    Shipped = 2,  // Seller marked shipped with evidence
    Released = 3, // Buyer confirmed; funds sent to seller
}

const BUYER: Symbol = symbol_short!("buyer");
const SELLER: Symbol = symbol_short!("seller");
const AMOUNT: Symbol = symbol_short!("amount");
const TOKEN: Symbol = symbol_short!("token");
const STATE: Symbol = symbol_short!("state");
const EVIDENCE: Symbol = symbol_short!("evidence");

#[contract]
pub struct Lumenswags;

#[contractimpl]
impl Lumenswags {
    /// Create a new escrow. Caller (buyer) must authorize. Seller receives funds when buyer confirms delivery.
    pub fn create(env: Env, buyer: Address, seller: Address, amount: i128, token: Address) {
        buyer.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }
        let state = EscrowState::Created;

        env.storage().instance().set(&BUYER, &buyer);
        env.storage().instance().set(&SELLER, &seller);
        env.storage().instance().set(&AMOUNT, &amount);
        env.storage().instance().set(&TOKEN, &token);
        env.storage().instance().set(&STATE, &state);
    }

    /// Buyer funds the escrow. Buyer must have approved this contract for `amount` on the token first.
    pub fn fund(env: Env) {
        let buyer: Address = env.storage().instance().get(&BUYER).unwrap_or_else(|| panic!("escrow not initialized"));
        let state: EscrowState = env.storage().instance().get(&STATE).unwrap_or_else(|| panic!("escrow not initialized"));
        if state != EscrowState::Created {
            panic!("invalid state: expected Created");
        }
        buyer.require_auth();

        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let amount: i128 = env.storage().instance().get(&AMOUNT).unwrap();
        let contract_id = env.current_contract_address();

        let token_client = TokenClient::new(&env, &token);
        token_client.transfer_from(&contract_id, &buyer, &contract_id, &amount);

        env.storage().instance().set(&STATE, &EscrowState::Funded);
    }

    /// Seller marks order as shipped and provides evidence (e.g. tracking link).
    pub fn mark_shipped(env: Env, evidence: String) {
        let seller: Address = env.storage().instance().get(&SELLER).unwrap_or_else(|| panic!("escrow not initialized"));
        let state: EscrowState = env.storage().instance().get(&STATE).unwrap_or_else(|| panic!("escrow not initialized"));
        if state != EscrowState::Funded {
            panic!("invalid state: expected Funded");
        }
        seller.require_auth();

        env.storage().instance().set(&EVIDENCE, &evidence);
        env.storage().instance().set(&STATE, &EscrowState::Shipped);
    }

    /// Buyer confirms delivery. Funds are transferred to the seller.
    pub fn confirm_delivery(env: Env) {
        let buyer: Address = env.storage().instance().get(&BUYER).unwrap_or_else(|| panic!("escrow not initialized"));
        let seller: Address = env.storage().instance().get(&SELLER).unwrap_or_else(|| panic!("escrow not initialized"));
        let state: EscrowState = env.storage().instance().get(&STATE).unwrap_or_else(|| panic!("escrow not initialized"));
        if state != EscrowState::Shipped {
            panic!("invalid state: expected Shipped");
        }
        buyer.require_auth();

        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let amount: i128 = env.storage().instance().get(&AMOUNT).unwrap();
        let contract_id = env.current_contract_address();

        let token_client = TokenClient::new(&env, &token);
        let to: MuxedAddress = seller.clone().into();
        token_client.transfer(&contract_id, &to, &amount);

        env.storage().instance().set(&STATE, &EscrowState::Released);
    }

    // --- Getters for UI / debugging ---

    pub fn get_buyer(env: Env) -> Address {
        env.storage().instance().get(&BUYER).unwrap_or_else(|| panic!("escrow not initialized"))
    }

    pub fn get_seller(env: Env) -> Address {
        env.storage().instance().get(&SELLER).unwrap_or_else(|| panic!("escrow not initialized"))
    }

    pub fn get_amount(env: Env) -> i128 {
        env.storage().instance().get(&AMOUNT).unwrap_or_else(|| panic!("escrow not initialized"))
    }

    pub fn get_token(env: Env) -> Address {
        env.storage().instance().get(&TOKEN).unwrap_or_else(|| panic!("escrow not initialized"))
    }

    pub fn get_state(env: Env) -> EscrowState {
        env.storage().instance().get(&STATE).unwrap_or_else(|| panic!("escrow not initialized"))
    }

    pub fn get_evidence(env: Env) -> String {
        env.storage().instance().get(&EVIDENCE).unwrap_or_else(|| panic!("no evidence set"))
    }
}

mod test;

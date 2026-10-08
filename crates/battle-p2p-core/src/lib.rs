//! Native content storage only: no listener, advertisement, authorization or replication.
//! Callers must enforce user consent and Hub authorization before network operations.
pub mod cache;
pub mod content;
pub mod validation;

import pytest
from cryptography.fernet import InvalidToken

from app.services import encryption_service


pytestmark = pytest.mark.unit


def test_encrypt_decrypt_round_trip():
    plaintext = "client-secret-xyz"
    cipher = encryption_service.encrypt(plaintext)
    assert isinstance(cipher, bytes)
    assert plaintext.encode() not in cipher
    assert encryption_service.decrypt(cipher) == plaintext


def test_decrypt_garbage_raises():
    with pytest.raises(InvalidToken):
        encryption_service.decrypt(b"not-a-valid-token")


def test_encrypt_is_non_deterministic():
    a = encryption_service.encrypt("same")
    b = encryption_service.encrypt("same")
    assert a != b
    assert encryption_service.decrypt(a) == "same"
    assert encryption_service.decrypt(b) == "same"

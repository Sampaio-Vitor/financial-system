"""Generate VAPID keys for Web Push notifications."""

import base64

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def main() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    private_value = private_key.private_numbers().private_value.to_bytes(32, "big")
    public_value = private_key.public_key().public_bytes(
        Encoding.X962,
        PublicFormat.UncompressedPoint,
    )

    print(f"VAPID_PUBLIC_KEY={_b64url(public_value)}")
    print(f"VAPID_PRIVATE_KEY={_b64url(private_value)}")
    print("VAPID_SUBJECT=https://cofrinhogordinho.uk")


if __name__ == "__main__":
    main()

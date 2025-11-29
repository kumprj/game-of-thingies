import json
import boto3
from datetime import datetime, timedelta
from typing import Dict, Any

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Games')

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Delete Games older than 48 hours"""

    # Calculate cutoff time (48 hours ago)
    cutoff_time = datetime.utcnow() - timedelta(hours=48)
    cutoff_iso = cutoff_time.isoformat() + 'Z'

    try:
        # Scan for old games
        response = table.scan(
            FilterExpression='createdAt < :cutoff',
            ExpressionAttributeValues={':cutoff': cutoff_iso}
        )

        old_games = response.get('Items', [])
        deleted_count = 0

        # Delete each old game
        for game in old_games:
            game_id = game['gameId']
            try:
                table.delete_item(Key={'gameId': game_id})
                deleted_count += 1
                print(f"Deleted game: {game_id}")
            except Exception as e:
                print(f"Failed to delete {game_id}: {str(e)}")

        print(f"Cleanup complete. Deleted {deleted_count} old games.")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Cleanup complete. Deleted {deleted_count} games older than 48 hours.',
                'cutoff_time': cutoff_iso
            })
        }

    except Exception as e:
        print(f"Scan failed: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

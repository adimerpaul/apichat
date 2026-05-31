import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../models/chat_message.dart';
import '../models/chat_user.dart';
import '../utils/parsers.dart';

class ChatSocketService {
  ChatSocketService({required this.baseUrl}) {
    _socket = io.io(
      baseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setExtraHeaders({'ngrok-skip-browser-warning': 'true'})
          .build(),
    );
    _bindEvents();
  }

  final String baseUrl;
  late final io.Socket _socket;

  final _historyController = StreamController<List<ChatMessage>>.broadcast();
  final _messageController = StreamController<ChatMessage>.broadcast();
  final _updatedController = StreamController<ChatMessage>.broadcast();
  final _deletedController = StreamController<int>.broadcast();
  final _errorController = StreamController<String>.broadcast();

  Stream<List<ChatMessage>> get historyStream => _historyController.stream;
  Stream<ChatMessage> get messageStream => _messageController.stream;
  Stream<ChatMessage> get updatedStream => _updatedController.stream;
  Stream<int> get deletedStream => _deletedController.stream;
  Stream<String> get errorStream => _errorController.stream;

  void _bindEvents() {
    _socket.on('connect_error', (_) {
      _errorController.add('No se pudo conectar con el servidor.');
    });
    _socket.on('chat:history', (data) {
      _historyController.add(_parseMessageList(data));
    });
    _socket.on('chat:message', (data) {
      final message = _parseMessage(data);
      if (message != null) {
        _messageController.add(message);
      }
    });
    _socket.on('chat:updated', (data) {
      final message = _parseMessage(data);
      if (message != null) {
        _updatedController.add(message);
      }
    });
    _socket.on('chat:deleted', (data) {
      final id = NumberParser.toInt(data is Map ? data['id'] : null);
      _deletedController.add(id);
    });
  }

  Future<ChatUser> register(String name) async {
    if (!_socket.connected) {
      _socket.connect();
    }

    final response = await _emitWithAck('user:register', name);
    if (response['ok'] != true) {
      throw Exception(response['message'] ?? 'No se pudo entrar al chat.');
    }

    return ChatUser.fromJson(
      Map<String, dynamic>.from(response['user'] as Map),
    );
  }

  Future<void> sendMessage(String text) async {
    final response = await _emitWithAck('chat:message', text);
    if (response['ok'] != true) {
      throw Exception(response['message'] ?? 'No se pudo enviar.');
    }
  }

  Future<Map<String, dynamic>> _emitWithAck(String event, Object data) async {
    final completer = Completer<Map<String, dynamic>>();
    _socket.emitWithAck(
      event,
      data,
      ack: (response) {
        if (response is Map) {
          completer.complete(Map<String, dynamic>.from(response));
          return;
        }

        completer.complete({'ok': false, 'message': 'Respuesta invalida.'});
      },
    );

    return completer.future.timeout(const Duration(seconds: 8));
  }

  ChatMessage? _parseMessage(dynamic data) {
    if (data is Map) {
      return ChatMessage.fromJson(Map<String, dynamic>.from(data));
    }

    return null;
  }

  List<ChatMessage> _parseMessageList(dynamic data) {
    if (data is! List) {
      return [];
    }

    return data
        .whereType<Map>()
        .map((item) => ChatMessage.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  void dispose() {
    _socket.dispose();
    _historyController.close();
    _messageController.close();
    _updatedController.close();
    _deletedController.close();
    _errorController.close();
  }
}
